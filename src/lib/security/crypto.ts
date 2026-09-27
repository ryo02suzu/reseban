import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// ---------- パスワード ----------
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** パスワードの条件（厚労省ガイドラインの「推測されにくい」を満たす最低限） */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < 12) return "パスワードは12文字以上にしてください";
  if (pw.length > 200) return "パスワードが長すぎます";
  if (/^(.)\1+$/.test(pw)) return "同じ文字の繰り返しは使えません";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds < 2) return "英字・数字・記号のうち2種類以上を混ぜてください";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "メールアドレスを含むパスワードは使えません";
  return null;
}

// ---------- トークン ----------
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function newId(prefix = ""): string {
  return `${prefix}${randomBytes(12).toString("base64url")}`;
}

// ---------- 保存データの暗号化（AES-256-GCM） ----------
let cachedKey: Buffer | null = null;

function dataKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.DATA_ENCRYPTION_KEY;
  if (env) {
    const k = Buffer.from(env, "base64");
    if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY は32バイトを base64 にしたものにしてください（openssl rand -base64 32）");
    cachedKey = k;
    return k;
  }
  if (process.env.NODE_ENV === "production" && process.env.RESEBAN_ALLOW_DEV_KEY !== "1") {
    throw new Error("本番環境では DATA_ENCRYPTION_KEY の設定が必要です");
  }
  // 開発用：ローカルに鍵ファイルを作る
  const dir = process.env.RESEBAN_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const file = path.join(dir, "dev-encryption-key");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  return cachedKey;
}

/** 形式：version(1) + iv(12) + tag(16) + 暗号文 */
export function encrypt(plain: Buffer | string, aad = ""): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dataKey(), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(typeof plain === "string" ? Buffer.from(plain) : plain), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]);
}

export function decrypt(data: Buffer, aad = ""): Buffer {
  if (data[0] !== 1) throw new Error("未対応の暗号形式です");
  const iv = data.subarray(1, 13);
  const tag = data.subarray(13, 29);
  const d = createDecipheriv("aes-256-gcm", dataKey(), iv);
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data.subarray(29)), d.final()]);
}

// ---------- 2段階認証（TOTP, RFC 6238） ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 の形式ではありません");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

/** 前後1ステップ（±30秒）まで許容 */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(now / 1000 / 30);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(totpAt(secret, step + d)), Buffer.from(c)));
}

export function totpUri(secret: string, email: string): string {
  return `otpauth://totp/${encodeURIComponent(`レセ番:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("レセ番")}&algorithm=SHA1&digits=6&period=30`;
}
