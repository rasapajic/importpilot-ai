"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";
import type { Locale } from "@/modules/i18n/translations";

type CreateProjectCopy = {
  productLabel: string;
  productPlaceholder: string;
  continue: string;
  detailsTitle: string;
  detailsText: string;
  targetCountry: string;
  countryPrompt: string;
  germany: string;
  austria: string;
  serbia: string;
  quantity: string;
  targetMargin: string;
  back: string;
  create: string;
  creating: string;
  error: string;
};

const copyByLocale: Record<Locale, CreateProjectCopy> = {
  sr: {
    productLabel: "Naziv ili opis proizvoda",
    productPlaceholder: "npr. sklopivi organizator za gepek sa tri pregrade",
    continue: "Nastavite",
    detailsTitle: "Podaci za pretragu",
    detailsText: "Ovi podaci su potrebni da bi ImportPilot pronašao odgovarajuće ponude.",
    targetCountry: "Zemlja uvoza",
    countryPrompt: "Izaberite zemlju",
    germany: "Nemačka",
    austria: "Austrija",
    serbia: "Srbija",
    quantity: "Količina",
    targetMargin: "Željena marža (%)",
    back: "Nazad",
    create: "Pokrenite pretragu",
    creating: "Kreiranje...",
    error: "Pretraga nije kreirana.",
  },
  de: {
    productLabel: "Produktname oder Beschreibung",
    productPlaceholder: "z. B. faltbarer Kofferraum-Organizer mit drei Fächern",
    continue: "Weiter",
    detailsTitle: "Angaben für die Suche",
    detailsText: "ImportPilot benötigt diese Angaben, um passende Angebote zu finden.",
    targetCountry: "Einfuhrland",
    countryPrompt: "Land auswählen",
    germany: "Deutschland",
    austria: "Österreich",
    serbia: "Serbien",
    quantity: "Menge",
    targetMargin: "Gewünschte Marge (%)",
    back: "Zurück",
    create: "Suche starten",
    creating: "Wird erstellt...",
    error: "Die Suche wurde nicht erstellt.",
  },
  en: {
    productLabel: "Product name or description",
    productPlaceholder: "e.g. foldable car trunk organizer with three compartments",
    continue: "Continue",
    detailsTitle: "Search details",
    detailsText: "ImportPilot needs these details to find suitable offers.",
    targetCountry: "Import country",
    countryPrompt: "Select a country",
    germany: "Germany",
    austria: "Austria",
    serbia: "Serbia",
    quantity: "Quantity",
    targetMargin: "Desired margin (%)",
    back: "Back",
    create: "Start search",
    creating: "Creating...",
    error: "The search was not created.",
  },
};

export function CreateProjectForm({ mode = "search" }: { mode?: "search" | "url" }) {
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const router = useRouter();
  const productNameRef = useRef<HTMLInputElement>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode === "search") productNameRef.current?.focus();
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailsVisible) {
      const productName = productNameRef.current;
      if (!productName?.checkValidity()) {
        productName?.reportValidity();
        return;
      }
      setDetailsVisible(true);
      setError("");
      return;
    }

    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !body.id) {
      setError(body.error ?? copy.error);
      setPending(false);
      return;
    }
    router.push(getProjectCreationDestination(body.id, mode));
    router.refresh();
  }

  return (
    <form className="project-form" data-entry-mode={mode} onSubmit={submit}>
      <label>
        {copy.productLabel}
        <input
          name="name"
          ref={productNameRef}
          required
          minLength={2}
          maxLength={160}
          placeholder={copy.productPlaceholder}
        />
      </label>

      {!detailsVisible ? (
        <button type="submit">{copy.continue}</button>
      ) : (
        <>
          <div className="form-intro">
            <h2>{copy.detailsTitle}</h2>
            <p>{copy.detailsText}</p>
          </div>
          <label>
            {copy.targetCountry}
            <select defaultValue="" name="targetCountry" required>
              <option disabled value="">{copy.countryPrompt}</option>
              <option value="DE">{copy.germany}</option>
              <option value="AT">{copy.austria}</option>
              <option value="RS">{copy.serbia}</option>
            </select>
          </label>
          <label>
            {copy.quantity}
            <input name="quantity" type="number" required min={1} step={1} />
          </label>
          <label>
            {copy.targetMargin}
            <input name="targetMargin" type="number" required min={0} max={100} step="0.01" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => {
              setDetailsVisible(false);
              setError("");
              window.requestAnimationFrame(() => productNameRef.current?.focus());
            }}
            type="button"
          >
            {copy.back}
          </button>
          <button disabled={pending} type="submit">
            {pending ? copy.creating : copy.create}
          </button>
        </>
      )}
    </form>
  );
}
