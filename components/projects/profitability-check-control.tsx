"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { readApiJson } from "@/lib/http/api-response";

const PROFITABILITY_CLIENT_TIMEOUT_MS = 18_000;

type ProfitabilityErrorCode =
  | "NO_CALCULATED_OFFERS"
  | "PROJECT_NOT_FOUND"
  | "CHECK_TIMEOUT"
  | "CHECK_FAILED"
  | "UNAUTHENTICATED";

type ProfitabilityResponse = {
  error?: ProfitabilityErrorCode;
};

function localizedError(
  code: ProfitabilityErrorCode | null,
  locale: "sr" | "de" | "en",
) {
  if (code === "NO_CALCULATED_OFFERS") {
    return locale === "de"
      ? "Erfassen Sie zuerst die Kosten für mindestens ein Angebot."
      : locale === "en"
        ? "Enter costs for at least one offer first."
        : "Prvo unesite troškove za najmanje jednu ponudu.";
  }
  if (code === "PROJECT_NOT_FOUND") {
    return locale === "de"
      ? "Das Projekt wurde nicht gefunden."
      : locale === "en"
        ? "The project was not found."
        : "Projekat nije pronađen.";
  }
  if (code === "UNAUTHENTICATED") {
    return locale === "de"
      ? "Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an."
      : locale === "en"
        ? "Your session has expired. Sign in again."
        : "Sesija je istekla. Prijavite se ponovo.";
  }
  if (code === "CHECK_TIMEOUT") {
    return locale === "de"
      ? "Die Prüfung dauerte zu lange und wurde beendet. Versuchen Sie es erneut."
      : locale === "en"
        ? "The check took too long and was stopped. Please try again."
        : "Provera je trajala predugo i prekinuta je. Pokušajte ponovo.";
  }
  return locale === "de"
    ? "Die Prüfung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut."
    : locale === "en"
      ? "The profitability check could not be completed. Please try again."
      : "Provera isplativosti nije završena. Pokušajte ponovo.";
}

export function ProfitabilityCheckControl({
  projectId,
  disabled,
  idleLabel,
  pendingLabel,
}: {
  projectId: string;
  disabled: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setError("");

    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(
      () => controller.abort("PROFITABILITY_CLIENT_TIMEOUT"),
      PROFITABILITY_CLIENT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        `/api/projects/${projectId}/profitability-check`,
        {
          method: "POST",
          headers: { accept: "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      const payload = await readApiJson<ProfitabilityResponse>(
        response,
        localizedError("CHECK_FAILED", locale),
      );

      if (!response.ok) {
        const code = payload.error ?? "CHECK_FAILED";
        if (code === "UNAUTHENTICATED") {
          router.push(`/login?next=${encodeURIComponent(`/projects/${projectId}`)}`);
          return;
        }
        throw new Error(localizedError(code, locale));
      }

      window.history.replaceState(
        null,
        "",
        `/projects/${projectId}#workflow-step-decision`,
      );
      router.refresh();
    } catch (requestError) {
      const message = controller.signal.aborted
        ? localizedError("CHECK_TIMEOUT", locale)
        : requestError instanceof Error && requestError.message
          ? requestError.message
          : localizedError("CHECK_FAILED", locale);
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      controllerRef.current = null;
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="profitability-check-control">
      <form
        action={`/api/projects/${projectId}/profitability-check`}
        method="post"
        onSubmit={submit}
      >
        <button
          aria-busy={pending}
          disabled={disabled || pending}
          type="submit"
        >
          {pending ? pendingLabel : idleLabel}
        </button>
      </form>
      {error && (
        <p className="form-error profitability-check-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
