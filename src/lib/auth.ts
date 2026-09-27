import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "./db";
import { sessions } from "./db/schema";
import { randomToken, sha256 } from "./security/crypto";
import { getClinic, getUser, type Actor, type Clinic, type Role, type User } from "./repo/core";
import { HttpError } from "./api";
import { DEMO_MODE } from "./demo/mode";
import { TERMS_VERSION } from "./terms";

export const SESSION_COOKIE = "rb_session";
/** 操作がなければ自動ログアウト（分） */
const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 60);
/** ログインの最長時間（時間） */
const ABSOLUTE_HOURS = Number(process.env.SESSION_MAX_HOURS ?? 12);

export { TERMS_VERSION };

export interface Session {
  user: User;
  clinic: Clinic | null;
  sessionId: string;
  pending2fa: boolean;
  /** 2段階認証の設定が必要（運営者・医院で必須にしている場合） */
  needs2faSetup: boolean;
  ip: string;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64);
}

export async function createSession(userId: string, pending2fa: boolean) {
  const token = randomToken(32);
  const h = await headers();
  const db = await getDb();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    pending2fa,
    expiresAt: new Date(Date.now() + ABSOLUTE_HOURS * 3600_000),
    ip: await clientIp(),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_HOURS * 3600,
  });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  c.delete(SESSION_COOKIE);
}

export async function destroyUserSessions(userId: string, exceptSessionId?: string) {
  const db = await getDb();
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) if (s.id !== exceptSessionId) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export async function completeSecondFactor(sessionId: string) {
  const db = await getDb();
  await db.update(sessions).set({ pending2fa: false }).where(eq(sessions.id, sessionId));
}

/** 現在のログイン状態（無効なら null） */
export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const id = sha256(token);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const user = await getUser(s.userId);
  if (!user || user.disabled) return null;
  const clinic = user.clinicId ? await getClinic(user.clinicId) : null;
  if (user.clinicId && (!clinic || clinic.status !== "active")) return null;
  // 1分に1回だけ最終操作時刻を更新
  if (now - s.lastSeenAt.getTime() > 60_000) await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  const mustHave2fa = (user.role === "operator" && !DEMO_MODE) || !!clinic?.require2fa || process.env.REQUIRE_2FA === "1";
  return {
    user,
    clinic,
    sessionId: id,
    pending2fa: s.pending2fa,
    needs2faSetup: mustHave2fa && !user.totpEnabled,
    ip: s.ip,
  };
}

export function actorOf(s: Session): Actor {
  return { clinicId: s.clinic?.id ?? null, userId: s.user.id, userEmail: s.user.email, ip: s.ip };
}

// ---------- ページ用のガード ----------
export async function requirePageUser(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.pending2fa) redirect("/login/2fa");
  if (s.user.termsVersion !== TERMS_VERSION) redirect("/account/terms");
  if (s.needs2faSetup) redirect("/account/security?setup=1");
  if (roles && !roles.includes(s.user.role)) redirect(s.user.role === "operator" ? "/admin" : "/");
  return s;
}

export async function requireClinicPage(roles: Role[] = ["owner", "staff"]): Promise<Session & { clinic: Clinic }> {
  const s = await requirePageUser(roles);
  if (!s.clinic) redirect("/admin");
  return s as Session & { clinic: Clinic };
}

// ---------- API 用のガード ----------
export async function requireApiUser(roles?: Role[], opts: { allowPending?: boolean } = {}): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "ログインしてください");
  if (s.pending2fa && !opts.allowPending) throw new HttpError(401, "2段階認証を完了してください");
  if (!opts.allowPending && s.needs2faSetup) throw new HttpError(403, "2段階認証の設定が必要です");
  if (!opts.allowPending && s.user.termsVersion !== TERMS_VERSION) throw new HttpError(403, "利用規約への同意が必要です");
  if (roles && !roles.includes(s.user.role)) throw new HttpError(403, "この操作の権限がありません");
  return s;
}

export async function requireClinicApi(roles: Role[] = ["owner", "staff"]): Promise<Session & { clinic: Clinic }> {
  const s = await requireApiUser(roles);
  if (!s.clinic) throw new HttpError(403, "医院のアカウントでログインしてください");
  return s as Session & { clinic: Clinic };
}

export async function purgeExpiredSessions() {
  const db = await getDb();
  await db.delete(sessions).where(and(lt(sessions.expiresAt, new Date())));
}
