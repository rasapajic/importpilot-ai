"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
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
      setError(data.error ?? "Došlo je do greške.");
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
            Ime i prezime
            <input name="name" autoComplete="name" required minLength={2} maxLength={120} />
          </label>
          <label>
            Naziv kompanije
            <input name="organizationName" autoComplete="organization" required minLength={2} maxLength={160} />
          </label>
        </>
      )}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required maxLength={320} />
      </label>
      <label>
        Lozinka
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
        {pending ? "Obrada..." : isRegister ? "Kreiraj nalog" : "Prijavi se"}
      </button>
    </form>
  );
}

