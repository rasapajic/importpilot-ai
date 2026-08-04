import type { Locale } from "@/modules/i18n/translations";

function serbianOfferCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
    ? "ponude"
    : "ponuda";
  return `${count} ${noun}`;
}

function germanOfferCount(count: number) {
  return `${count} ${count === 1 ? "Angebot" : "Angebote"}`;
}

function englishOfferCount(count: number) {
  return `${count} ${count === 1 ? "offer" : "offers"}`;
}

export function getClientDecisionSummary({
  locale,
  offerCount,
  supplierName,
  overallScore,
}: {
  locale: Locale;
  offerCount: number;
  supplierName: string;
  overallScore: number | null;
}) {
  const additionalOfferCount = Math.max(0, 3 - offerCount);
  const scoreText = overallScore === null ? "" : ` (${overallScore}/100)`;

  if (locale === "de") {
    const comparison = additionalOfferCount > 0
      ? ` Für eine sicherere Entscheidung vergleichen Sie noch ${germanOfferCount(additionalOfferCount)}.`
      : "";
    return `Analysiert: ${germanOfferCount(offerCount)}. Bestes Angebot: ${supplierName}${scoreText}.${comparison}`;
  }

  if (locale === "en") {
    const comparison = additionalOfferCount > 0
      ? ` For a more confident decision, compare ${englishOfferCount(additionalOfferCount)} more.`
      : "";
    return `Analysed: ${englishOfferCount(offerCount)}. Best offer: ${supplierName}${scoreText}.${comparison}`;
  }

  const comparison = additionalOfferCount > 0
    ? ` Za sigurniju odluku uporedite još ${serbianOfferCount(additionalOfferCount)}.`
    : "";
  return `Analizirano: ${serbianOfferCount(offerCount)}. Najbolje ocenjena ponuda: ${supplierName}${scoreText}.${comparison}`;
}
