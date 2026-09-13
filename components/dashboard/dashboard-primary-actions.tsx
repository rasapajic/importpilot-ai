"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import { getProjectCreationDestination } from "@/modules/projects/application/project-creation-destination";

import styles from "./dashboard-primary-actions.module.css";

type IntakeCopy = {
  productLabel: string;
  productPlaceholder: string;
  destination: string;
  destinationPrompt: string;
  germany: string;
  austria: string;
  serbia: string;
  quantity: string;
  create: string;
  creating: string;
  createFailed: string;
};

const copy: Record<Locale, IntakeCopy> = {
  sr: {
    productLabel: "Proizvod",
    productPlaceholder: "npr. USB-C 100W kabl",
    destination: "Destinacija",
    destinationPrompt: "Izaberite zemlju",
    germany: "Nemačka",
    austria: "Austrija",
    serbia: "Srbija",
    quantity: "Količina",
    create: "Pronađi najbolje ponude",
    creating: "Pretraga se pokreće...",
    createFailed: "Pretraga nije kreirana. Pokušajte ponovo.",
  },
  de: {
    productLabel: "Produkt",
    productPlaceholder: "z. B. USB-C 100W Kabel",
    destination: "Zielland",
    destinationPrompt: "Land auswählen",
    germany: "Deutschland",
    austria: "Österreich",
    serbia: "Serbien",
    quantity: "Menge",
    create: "Beste Angebote finden",
    creating: "Suche wird gestartet...",
    createFailed: "Die Suche wurde nicht erstellt. Bitte versuchen Sie es erneut.",
  },
  en: {
    productLabel: "Product",
    productPlaceholder: "e.g. USB-C 100W cable",
    destination: "Destination",
    destinationPrompt: "Select a country",
    germany: "Germany",
    austria: "Austria",
    serbia: "Serbia",
    quantity: "Quantity",
    create: "Find best offers",
    creating: "Starting search...",
    createFailed: "The search was not created. Please try again.",
  },
};

export function DashboardPrimaryActions() {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          targetCountry: form.get("targetCountry"),
          quantity: form.get("quantity"),
        }),
      });
      const project = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;

      if (!response.ok || !project?.id) {
        throw new Error(project?.error ?? text.createFailed);
      }

      router.push(getProjectCreationDestination(project.id, "search"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.createFailed);
      setPending(false);
    }
  }

  return (
    <form className={styles.card} aria-busy={pending} onSubmit={createSearch}>
      <label className={styles.mainLabel}>
        {text.productLabel}
        <textarea
          className={styles.description}
          maxLength={160}
          minLength={2}
          name="name"
          placeholder={text.productPlaceholder}
          required
        />
      </label>

      <div className={styles.businessGrid}>
        <label className={styles.fieldLabel}>
          {text.quantity}
          <input min="1" name="quantity" placeholder="100" required step="1" type="number" />
        </label>
        <label className={styles.fieldLabel}>
          {text.destination}
          <select defaultValue="" name="targetCountry" required>
            <option disabled value="">{text.destinationPrompt}</option>
            <option value="AT">{text.austria}</option>
            <option value="DE">{text.germany}</option>
            <option value="RS">{text.serbia}</option>
          </select>
        </label>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.footerActions}>
        <span />
        <button className={styles.primaryAction} disabled={pending} type="submit">
          {pending ? text.creating : text.create}
        </button>
      </div>
    </form>
  );
}
