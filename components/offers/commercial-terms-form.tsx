"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

type Copy = {
  title: string;
  description: string;
  price: string;
  currency: string;
  incoterm: string;
  delivery: string;
  deliveryOptional: string;
  save: string;
  saving: string;
  error: string;
};

const copy: Record<Locale, Copy> = {
  sr: {
    title: "Potvrdite podatke ponude",
    description: "Za tačan obračun potrebni su cena, valuta i Incoterm. Unesite ili potvrdite samo ove podatke.",
    price: "Cena po komadu",
    currency: "Valuta",
    incoterm: "Incoterm",
    delivery: "Rok isporuke (dana)",
    deliveryOptional: "opciono",
    save: "Potvrdi i nastavi",
    saving: "Čuvanje...",
    error: "Podaci ponude nisu sačuvani.",
  },
  de: {
    title: "Angebotsdaten bestätigen",
    description: "Für eine verlässliche Kalkulation werden Preis, Währung und Incoterm benötigt. Bestätigen oder ergänzen Sie nur diese Angaben.",
    price: "Stückpreis",
    currency: "Währung",
    incoterm: "Incoterm",
    delivery: "Lieferzeit (Tage)",
    deliveryOptional: "optional",
    save: "Bestätigen und weiter",
    saving: "Wird gespeichert...",
    error: "Die Angebotsdaten wurden nicht gespeichert.",
  },
  en: {
    title: "Confirm offer details",
    description: "A reliable calculation needs price, currency, and Incoterm. Confirm or complete only these details.",
    price: "Unit price",
    currency: "Currency",
    incoterm: "Incoterm",
    delivery: "Delivery time (days)",
    deliveryOptional: "optional",
    save: "Confirm and continue",
    saving: "Saving...",
    error: "The offer details were not saved.",
  },
};

export function CommercialTermsForm({
  offerId,
  unitPrice,
  currency,
  incoterm,
  deliveryTimeDays,
}: {
  offerId: string;
  unitPrice: string | null;
  currency: string | null;
  incoterm: string | null;
  deliveryTimeDays: number | null;
}) {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/offers/${offerId}/commercial-terms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitPrice: form.get("unitPrice"),
          currency: form.get("currency"),
          incoterm: form.get("incoterm"),
          deliveryTimeDays: form.get("deliveryTimeDays"),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || text.error);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="offer-form" onSubmit={submit}>
      <header className="cost-form-wide">
        <h3>{text.title}</h3>
        <p className="muted-text">{text.description}</p>
      </header>
      <label>
        {text.price}
        <input
          defaultValue={unitPrice ?? ""}
          min="0.0001"
          name="unitPrice"
          required
          step="0.0001"
          type="number"
        />
      </label>
      <label>
        {text.currency}
        <input
          defaultValue={currency ?? ""}
          maxLength={3}
          name="currency"
          pattern="[A-Za-z]{3}"
          placeholder="EUR"
          required
        />
      </label>
      <label>
        {text.incoterm}
        <input
          defaultValue={incoterm ?? ""}
          list={`incoterm-options-${offerId}`}
          maxLength={20}
          name="incoterm"
          placeholder="EXW / FOB / FCA"
          required
        />
        <datalist id={`incoterm-options-${offerId}`}>
          <option value="EXW" />
          <option value="FCA" />
          <option value="FOB" />
          <option value="CIF" />
          <option value="CIP" />
          <option value="DAP" />
          <option value="DDP" />
        </datalist>
      </label>
      <label>
        {text.delivery} <small>({text.deliveryOptional})</small>
        <input
          defaultValue={deliveryTimeDays ?? ""}
          min="0"
          name="deliveryTimeDays"
          step="1"
          type="number"
        />
      </label>
      {error && <p className="form-error cost-form-wide" role="alert">{error}</p>}
      <button className="cost-form-wide" disabled={pending} type="submit">
        {pending ? text.saving : text.save}
      </button>
    </form>
  );
}
