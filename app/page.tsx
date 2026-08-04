import Link from "next/link";

import { getServerLocale } from "@/modules/i18n/server";
import { translateText } from "@/modules/i18n/translations";

export default async function HomePage() {
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);

  return (
    <main className="home-shell">
      <section className="hero">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{t("Smarter decisions for importing from China.")}</h1>
        <p className="lede">
          {t("Manage supplier offers, real costs, risks and documents in one place.")}
        </p>
        <div className="actions">
          <Link className="primary-link" href="/register">{t("Get started")}</Link>
          <Link href="/login">{t("Sign in")}</Link>
        </div>
      </section>
      <section className="how-it-works">
        <p className="eyebrow">{t("How ImportPilot works")}</p>
        <h2>{t("From supplier offer to a clear decision.")}</h2>
        <div className="onboarding-grid">
          <article><strong>{t("1. Add a project and offers")}</strong><p>{t("Enter target country, quantity and supplier offers.")}</p></article>
          <article><strong>{t("2. Calculate the real cost")}</strong><p>{t("Compare landed cost, risk, quality and margin.")}</p></article>
          <article><strong>{t("3. Make a decision")}</strong><p>{t("Get a recommendation, next steps and a negotiation message.")}</p></article>
        </div>
      </section>
    </main>
  );
}
