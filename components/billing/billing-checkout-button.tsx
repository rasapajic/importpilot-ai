"use client";

import { useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

type Props =
  | {
      kind: "SUBSCRIPTION";
      plan: "PLUS" | "PRO";
      disabled?: boolean;
    }
  | {
      kind: "FULL_IMPORT_ANALYSIS";
      projectId: string;
      disabled?: boolean;
    };

const copy: Record<Locale, {
  start: string;
  starting: string;
  unavailable: string;
  failed: string;
}> = {
  sr: {
    start: "Nastavi na plaćanje",
    starting: "Otvaranje plaćanja...",
    unavailable: "Plaćanje još nije povezano.",
    failed: "Checkout nije mogao da se pokrene.",
  },
  de: {
    start: "Weiter zur Zahlung",
    starting: "Zahlung wird geöffnet...",
    unavailable: "Die Zahlungsabwicklung ist noch nicht verbunden.",
    failed: "Checkout konnte nicht gestartet werden.",
  },
  en: {
    start: "Continue to payment",
    starting: "Opening payment...",
    unavailable: "Payments are not connected yet.",
    failed: "Checkout could not be started.",
  },
};

export function BillingCheckoutButton(props: Props) {
  const { locale } = useI18n();
  const text = copy[locale];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    if (props.disabled || pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          props.kind === "SUBSCRIPTION"
            ? { kind: props.kind, plan: props.plan }
            : { kind: props.kind, projectId: props.projectId },
        ),
      });
      const payload = await response.json().catch(() => null) as {
        url?: string;
        code?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.url) {
        if (payload?.code === "BILLING_PROVIDER_NOT_CONFIGURED") {
          throw new Error(text.unavailable);
        }
        throw new Error(payload?.error ?? text.failed);
      }

      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failed);
      setPending(false);
    }
  }

  return (
    <div>
      <button
        aria-busy={pending}
        disabled={props.disabled || pending}
        onClick={() => void checkout()}
        type="button"
      >
        {pending ? text.starting : text.start}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
