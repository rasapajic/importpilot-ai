import Link from "next/link";

import { googleOAuthConfigured } from "@/modules/auth/infrastructure/google-oauth";
import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";

type GoogleAuthButtonProps = {
  mode: "login" | "register";
};

const copy: Record<Locale, {
  continueWithGoogle: string;
  unavailable: string;
  or: string;
}> = {
  sr: {
    continueWithGoogle: "Nastavi preko Google-a",
    unavailable: "Google prijava još nije podešena na ovom okruženju.",
    or: "ili",
  },
  de: {
    continueWithGoogle: "Mit Google fortfahren",
    unavailable: "Google-Anmeldung ist in dieser Umgebung noch nicht eingerichtet.",
    or: "oder",
  },
  en: {
    continueWithGoogle: "Continue with Google",
    unavailable: "Google sign-in is not configured in this environment yet.",
    or: "or",
  },
};

export async function GoogleAuthButton({ mode }: GoogleAuthButtonProps) {
  const locale = await getServerLocale();
  const text = copy[locale];
  const enabled = googleOAuthConfigured();
  const content = (
    <>
      <span className="auth-google-mark" aria-hidden="true">G</span>
      <span>{text.continueWithGoogle}</span>
    </>
  );

  return (
    <div className="auth-google-block">
      {enabled ? (
        <Link
          className="auth-google-button"
          href={`/api/auth/google/start?from=${mode}`}
        >
          {content}
        </Link>
      ) : (
        <button
          className="auth-google-button"
          disabled
          title={text.unavailable}
          type="button"
        >
          {content}
        </button>
      )}
      <div className="auth-divider" aria-hidden="true">
        <span>{text.or}</span>
      </div>
    </div>
  );
}
