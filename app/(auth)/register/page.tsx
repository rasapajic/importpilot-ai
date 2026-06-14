import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>Kreirajte kompanijski nalog.</h1>
        <AuthForm mode="register" />
        <p>Već imate nalog? <Link href="/login">Prijavite se</Link></p>
      </section>
    </main>
  );
}
