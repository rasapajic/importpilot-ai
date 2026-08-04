import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/dashboard");
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{t("Create a company account.")}</h1>
        <AuthForm mode="register" />
        <p>{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></p>
      </section>
    </main>
  );
}
