import Link from "next/link";

import { DashboardPrimaryActions } from "@/components/dashboard/dashboard-primary-actions";
import { CreateProjectFromUrlForm } from "@/components/projects/create-project-from-url-form";
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
    searchIntro: "Unesite proizvod, količinu i destinaciju. ImportPilot će zatim pronaći i uporediti ponude.",
    urlIntro: "Proverite link proizvoda. Nakon pregleda unosite podatke potrebne za računicu.",
  },
  de: {
    back: "Zurück zu meinen Suchen",
    title: "Welches Produkt suchen Sie?",
    searchIntro: "Geben Sie Produkt, Menge und Zielland ein. ImportPilot sucht und vergleicht anschließend passende Angebote.",
    urlIntro: "Prüfen Sie den Produktlink. Danach geben Sie die für die Kalkulation nötigen Angaben ein.",
  },
  en: {
    back: "Back to my searches",
    title: "Which product are you looking for?",
    searchIntro: "Enter the product, quantity, and destination. ImportPilot will then find and compare suitable offers.",
    urlIntro: "Review the product link. After review, enter the details needed for the calculation.",
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
      {mode === "url" ? (
        <section className="dashboard-card">
          <CreateProjectFromUrlForm
            initialProductName={initialDescription}
            initialProductUrl={initialProductUrl}
          />
        </section>
      ) : (
        <DashboardPrimaryActions />
      )}
    </main>
  );
}
