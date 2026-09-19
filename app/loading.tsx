"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

const copy: Record<Locale, { title: string; body: string }> = {
  sr: {
    title: "Učitavanje JAKOV360 podataka...",
    body: "Pripremamo najnovije informacije za vaš projekat.",
  },
  de: {
    title: "JAKOV360-Daten werden geladen...",
    body: "Wir bereiten die neuesten Informationen für Ihr Projekt vor.",
  },
  en: {
    title: "Loading JAKOV360 data...",
    body: "We are preparing the latest information for your project.",
  },
};

export default function Loading() {
  const { locale } = useI18n();
  const text = copy[locale];

  return (
    <main>
      <section className="dashboard-card loading-state" aria-live="polite">
        <div className="loading-indicator" />
        <h2>{text.title}</h2>
        <p>{text.body}</p>
      </section>
    </main>
  );
}
