import Link from "next/link";

import { CreateProjectFromUrlForm } from "@/components/projects/create-project-from-url-form";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { getServerLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/translations";

type NewProjectCopy = {
  back: string;
  title: string;
  searchIntro: string;
  urlIntro: string;
};

const newProjectCopy: Record<Locale, NewProjectCopy> = {
  sr: {
    back: "Nazad na moje pretrage",
    title: "Koji proizvod tražite?",
    searchIntro: "Za početak opišite proizvod koji tražite. Poslovne podatke unosite u sledećem koraku.",
    urlIntro: "Proverite link proizvoda. Nakon pregleda unosite količinu, zemlju uvoza i ciljnu maržu.",
  },
  de: {
    back: "Zurück zu meinen Suchen",
    title: "Welches Produkt suchen Sie?",
    searchIntro: "Beschreiben Sie zuerst das gesuchte Produkt. Die Geschäftsdaten folgen im nächsten Schritt.",
    urlIntro: "Prüfen Sie den Produktlink. Nach der Prüfung geben Sie Menge, Einfuhrland und Zielmarge an.",
  },
  en: {
    back: "Back to my searches",
    title: "Which product are you looking for?",
    searchIntro: "Start by describing the product you are looking for. Business details come in the next step.",
    urlIntro: "Review the product link. After review, enter quantity, import country, and target margin.",
  },
};

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    productUrl?: string;
    description?: string;
  }>;
}) {
  await requireSession();
  const locale = await getServerLocale();
  const copy = newProjectCopy[locale];
  const resolvedSearchParams = await searchParams;
  const mode = resolvedSearchParams.mode === "url" ? "url" : "search";
  const initialProductUrl = typeof resolvedSearchParams.productUrl === "string"
    ? resolvedSearchParams.productUrl
    : "";
  const initialDescription = typeof resolvedSearchParams.description === "string"
    ? resolvedSearchParams.description
    : "";

  return (
    <main className="dashboard-shell">
      <p><Link href="/dashboard">{copy.back}</Link></p>
      <h1>{copy.title}</h1>
      <p className="muted-text">
        {mode === "url" ? copy.urlIntro : copy.searchIntro}
      </p>
      <section className="dashboard-card">
        {mode === "url" ? (
          <CreateProjectFromUrlForm
            initialProductName={initialDescription}
            initialProductUrl={initialProductUrl}
          />
        ) : (
          <CreateProjectForm mode={mode} />
        )}
      </section>
    </main>
  );
}
