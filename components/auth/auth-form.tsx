"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { readApiJson } from "@/lib/http/api-response";
import type { Locale } from "@/modules/i18n/translations";

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

type AuthFormProps = {
  mode: "login" | "register";
};

type AuthResponse = {
  ok?: boolean;
  error?: string;
};

const authCopy: Record<Locale, {
  fullName: string;
  companyName: string;
  email: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  processing: string;
  createAccount: string;
  signIn: string;
  genericError: string;
  timeoutError: string;
}> = {
  sr: {
    fullName: "Ime i prezime",
    companyName: "Naziv kompanije",
    email: "Email",
    password: "Lozinka",
    showPassword: "Prikaži lozinku",
    hidePassword: "Sakrij lozinku",
    processing: "Obrada...",
    createAccount: "Kreiraj nalog",
    signIn: "Prijavi se",
    genericError: "Registracija ili prijava trenutno nije završena. Pokušajte ponovo.",
    timeoutError: "Zahtev je trajao predugo i prekinut je. Ako ste pravili nalog, pokušajte prvo da se prijavite.",
  },
  de: {
    fullName: "Vor- und Nachname",
    companyName: "Firmenname",
    email: "E-Mail",
    password: "Passwort",
    showPassword: "Passwort anzeigen",
    hidePassword: "Passwort ausblenden",
    processing: "Verarbeitung...",
    createAccount: "Konto erstellen",
    signIn: "Anmelden",
    genericError: "Registrierung oder Anmeldung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
    timeoutError: "Die Anfrage dauerte zu lange und wurde beendet. Wenn Sie ein Konto erstellt haben, versuchen Sie zuerst, sich anzumelden.",
  },
  en: {
    fullName: "Full name",
    companyName: "Company name",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    processing: "Processing...",
    createAccount: "Create account",
    signIn: "Sign in",
    genericError: "Registration or sign-in could not be completed. Please try again.",
    timeoutError: "The request took too long and was stopped. If you were creating an account, try signing in first.",
  },
};

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.24A10.7 10.7 0 0112 4c5.5 0 9 5 9 5a17.8 17.8 0 01-3.06 3.45M6.61 6.61C4.36 8.12 3 10 3 10s3.5 5 9 5a10.4 10.4 0 003.39-.55" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3 10s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const copy = authCopy[locale];
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === "register";
  const passwordId = `auth-password-${mode}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await readApiJson<AuthResponse>(response, copy.genericError);

      if (!response.ok) {
        setError(data.error === "AUTH_UNAVAILABLE"
          ? copy.genericError
          : t(data.error ?? copy.genericError));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (requestError) {
      if (controller.signal.aborted) {
        setError(copy.timeoutError);
      } else {
        setError(requestError instanceof Error && requestError.message
          ? requestError.message
          : copy.genericError);
      }
    } finally {
      window.clearTimeout(timeout);
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {isRegister && (
        <>
          <label>
            {copy.fullName}
            <input name="name" autoComplete="name" required minLength={2} maxLength={120} />
          </label>
          <label>
            {copy.companyName}
            <input name="organizationName" autoComplete="organization" required minLength={2} maxLength={160} />
          </label>
        </>
      )}
      <label>
        {copy.email}
        <input name="email" type="email" autoComplete="email" required maxLength={320} />
      </label>
      <label htmlFor={passwordId}>{copy.password}</label>
      <div className="auth-password-field">
        <input
          id={passwordId}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 12 : 1}
          maxLength={200}
        />
        <button
          aria-label={showPassword ? copy.hidePassword : copy.showPassword}
          aria-pressed={showPassword}
          className="auth-password-toggle"
          onClick={() => setShowPassword((current) => !current)}
          title={showPassword ? copy.hidePassword : copy.showPassword}
          type="button"
        >
          <EyeIcon visible={showPassword} />
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={pending} type="submit">
        {pending ? copy.processing : isRegister ? copy.createAccount : copy.signIn}
      </button>
    </form>
  );
}
