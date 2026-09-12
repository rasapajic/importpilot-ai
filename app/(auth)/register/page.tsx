import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { GoogleAuthFeedback } from "@/components/auth/google-auth-feedback";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

type RegisterPageProps = {
  searchParams?: Promise<{ googleError?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await getCurrentSession()) redirect("/dashboard");
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{t("Create a company account.")}</h1>
        <GoogleAuthFeedback code={resolvedSearchParams.googleError} />
        <GoogleAuthButton mode="register" />
        <AuthForm mode="register" />
        <p>{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></p>
      </section>
    </main>
  );
}
