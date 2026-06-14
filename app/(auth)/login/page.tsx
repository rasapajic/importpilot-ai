import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>Dobro došli nazad.</h1>
        <AuthForm mode="login" />
        <p>Nemate nalog? <Link href="/register">Registrujte se</Link></p>
      </section>
    </main>
  );
}
