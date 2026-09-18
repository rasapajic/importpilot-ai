import Link from "next/link";

import { getServerLocale } from "@/modules/i18n/server";
import { translateText, type Locale } from "@/modules/i18n/translations";

type LandingCopy = {
  title: string;
  lede: string;
  howTitle: string;
  step1Title: string;
  step1Text: string;
  step2Title: string;
  step2Text: string;
  step3Title: string;
  step3Text: string;
  googleDataNote: string;
};

const copy: Record<Locale, LandingCopy> = {
  en: {
    title: "Find the best real procurement — not just the cheapest listing.",
    lede: "Enter the product, quantity and destination. ImportPilot compares offers, real import cost and supplier risk for you.",
    howTitle: "From product search to a clear buying decision.",
    step1Title: "1. Tell us what you need",
    step1Text: "Enter the product, quantity and destination.",
    step2Title: "2. Compare the best offers",
    step2Text: "See supplier price, estimated landed cost, delivery and supplier risk.",
    step3Title: "3. Get a clear decision",
    step3Text: "Review profitability and get BUY, NEGOTIATE, WATCH or SKIP.",
    googleDataNote: "Google Sign-In uses your Google account name and verified email only to create or link your ImportPilot account.",
  },
  de: {
    title: "Finden Sie die beste reale Beschaffung — nicht nur das billigste Angebot.",
    lede: "Geben Sie Produkt, Menge und Zielland ein. ImportPilot vergleicht Angebote, reale Importkosten und Lieferantenrisiko.",
    howTitle: "Von der Produktsuche zu einer klaren Kaufentscheidung.",
    step1Title: "1. Sagen Sie uns, was Sie brauchen",
    step1Text: "Geben Sie Produkt, Menge und Zielland ein.",
    step2Title: "2. Vergleichen Sie die besten Angebote",
    step2Text: "Sehen Sie Lieferantenpreis, geschätzte Landed Cost, Lieferzeit und Lieferantenrisiko.",
    step3Title: "3. Erhalten Sie eine klare Entscheidung",
    step3Text: "Prüfen Sie die Rentabilität und erhalten Sie BUY, NEGOTIATE, WATCH oder SKIP.",
    googleDataNote: "Google Sign-In verwendet nur den Namen und die bestätigte E-Mail-Adresse Ihres Google-Kontos, um Ihr ImportPilot-Konto anzulegen oder zu verknüpfen.",
  },
  sr: {
    title: "Pronađite najbolju stvarnu nabavku — ne samo najjeftiniju oglašenu cenu.",
    lede: "Unesite proizvod, količinu i destinaciju. ImportPilot za vas poredi ponude, stvarni trošak uvoza i rizik dobavljača.",
    howTitle: "Od pretrage proizvoda do jasne odluke o kupovini.",
    step1Title: "1. Recite šta vam treba",
    step1Text: "Unesite proizvod, količinu i destinaciju.",
    step2Title: "2. Uporedite najbolje ponude",
    step2Text: "Vidite cenu dobavljača, procenjeni ukupan trošak uvoza, rok isporuke i rizik dobavljača.",
    step3Title: "3. Dobijte jasnu odluku",
    step3Text: "Proverite isplativost i dobijte odluku: KUPI, PREGOVARAJ, PRATI ili PRESKOČI.",
    googleDataNote: "Google prijava koristi samo ime i potvrđenu email adresu sa vašeg Google naloga da kreira ili poveže vaš ImportPilot nalog.",
  },
};

export default async function HomePage() {
  const locale = await getServerLocale();
  const text = copy[locale];
  const t = (value: string) => translateText(value, locale);

  return (
    <main className="home-shell">
      <section className="hero">
        <p className="eyebrow">ImportPilot AI</p>
        <h1>{text.title}</h1>
        <p className="lede">{text.lede}</p>
        <div className="actions">
          <Link className="primary-link" href="/register">{t("Get started")}</Link>
          <Link href="/login">{t("Sign in")}</Link>
        </div>
        <p className="privacy-note">{text.googleDataNote}</p>
      </section>
      <section className="how-it-works">
        <p className="eyebrow">{t("How ImportPilot works")}</p>
        <h2>{text.howTitle}</h2>
        <div className="onboarding-grid">
          <article><strong>{text.step1Title}</strong><p>{text.step1Text}</p></article>
          <article><strong>{text.step2Title}</strong><p>{text.step2Text}</p></article>
          <article><strong>{text.step3Title}</strong><p>{text.step3Text}</p></article>
        </div>
      </section>
    </main>
  );
}
