"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

type AuthFormProps = {
  mode: "login" | "register";
};

const authCopy: Record<Locale, {
  fullName: string;
  companyName: string;
  email: string;
  password: string;
  processing: string;
  createAccount: string;
  signIn: string;
  genericError: string;
}> = {
  sr: {
    fullName: "Ime i prezime",
    companyName: "Naziv kompanije",
    email: "Email",
    password: "Lozinka",
    processing: "Obrada...",
    createAccount: "Kreiraj nalog",
    signIn: "Prijavi se",
    genericError: "Došlo je do greške.",
  },
  de: {
    fullName: "Vor- und Nachname",
    companyName: "Firmenname",
    email: "E-Mail",
    password: "Passwort",
    processing: "Verarbeitung...",
    createAccount: "Konto erstellen",
    signIn: "Anmelden",
    genericError: "Ein Fehler ist aufgetreten.",
  },
  en: {
    fullName: "Full name",
    companyName: "Company name",
    email: "Email",
    password: "Password",
    processing: "Processing...",
    createAccount: "Create account",
    signIn: "Sign in",
    genericError: "An error occurred.",
  },
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const copy = authCopy[locale];
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(t(data.error ?? copy.genericError));
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
      <label>
        {copy.password}
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 12 : 1}
          maxLength={200}
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={pending} type="submit">
        {pending ? copy.processing : isRegister ? copy.createAccount : copy.signIn}
      </button>
    </form>
  );
}
