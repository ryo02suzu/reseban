import { MembersClient } from "@/components/MembersClient";
import { requireClinicPage } from "@/lib/auth";
import { listUsers } from "@/lib/repo/core";

export default async function MembersPage() {
  const s = await requireClinicPage(["owner"]);
  const users = await listUsers(s.clinic.id);
  return (
    <MembersClient
      me={s.user.id}
      initial={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as "owner" | "staff",
        disabled: u.disabled,
        totpEnabled: u.totpEnabled,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      }))}
    />
  );
}
