import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { GoogleAuthFeedback } from "@/components/auth/google-auth-feedback";
import { NativeAuthFeedback } from "@/components/auth/native-auth-feedback";
import { getCurrentSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

type LoginPageProps = {
  searchParams?: Promise<{ googleError?: string; authError?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentSession()) redirect("/dashboard");
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{t("Welcome back.")}</h1>
        <GoogleAuthFeedback code={resolvedSearchParams.googleError} />
        <NativeAuthFeedback code={resolvedSearchParams.authError} />
        <GoogleAuthButton mode="login" />
        <AuthForm mode="login" />
        <p>{t("Don't have an account?")} <Link href="/register">{t("Register")}</Link></p>
      </section>
    </main>
  );
}
