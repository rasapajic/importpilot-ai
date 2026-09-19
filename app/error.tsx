"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";

const copy: Record<Locale, {
  eyebrow: string;
  title: string;
  body: string;
  retry: string;
}> = {
  sr: {
    eyebrow: "Nešto nije uspelo",
    title: "Nismo mogli da prikažemo ovu stranicu.",
    body: "Vaši podaci nisu promenjeni. Pokušajte ponovo za nekoliko trenutaka.",
    retry: "Pokušaj ponovo",
  },
  de: {
    eyebrow: "Etwas ist schiefgelaufen",
    title: "Diese Seite konnte nicht angezeigt werden.",
    body: "Ihre Daten wurden nicht geändert. Bitte versuchen Sie es in wenigen Augenblicken erneut.",
    retry: "Erneut versuchen",
  },
  en: {
    eyebrow: "Something went wrong",
    title: "We could not display this page.",
    body: "Your data has not changed. Please try again in a few moments.",
    retry: "Try again",
  },
};

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { locale } = useI18n();
  const text = copy[locale];

  return (
    <main>
      <section className="dashboard-card empty-state">
        <p className="eyebrow">{text.eyebrow}</p>
        <h2>{text.title}</h2>
        <p>{text.body}</p>
        <button onClick={reset} type="button">{text.retry}</button>
      </section>
    </main>
  );
}
