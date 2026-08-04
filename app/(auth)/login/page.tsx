import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{t("Welcome back.")}</h1>
        <AuthForm mode="login" />
        <p>{t("Don't have an account?")} <Link href="/register">{t("Register")}</Link></p>
      </section>
    </main>
  );
}
