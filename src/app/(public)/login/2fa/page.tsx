import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/AuthForms";
import { getSession } from "@/lib/auth";

export default async function TwoFactorPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.pending2fa) redirect("/");
  return (
    <>
      <h1>2段階認証</h1>
      <TwoFactorForm />
    </>
  );
}
