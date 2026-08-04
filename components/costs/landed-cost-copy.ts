import type { Locale } from "@/modules/i18n/translations";

const countryNames: Record<Locale, Record<string, string>> = {
  sr: { RS: "Srbiji", AT: "Austriji", DE: "Nemačkoj" },
  de: { RS: "Serbien", AT: "Österreich", DE: "Deutschland" },
  en: { RS: "Serbia", AT: "Austria", DE: "Germany" },
};

const labels = {
  sr: {
    goodsCost: "Vrednost robe",
    chinaDomesticTransport: "Transport unutar Kine",
    internationalTransport: "Međunarodni transport",
    insurance: "Osiguranje transporta",
    customsBroker: "Špediter i carinjenje",
    customsDuty: "Carina",
    vat: "PDV",
    inspection: "Kontrola robe / inspekcija",
    storage: "Skladištenje",
    other: "Ostali troškovi",
    sellingPrice: "Planirana prodajna cena",
    transportConfirmed: "Transportni troškovi su potvrđeni ponudom špeditera",
    customsConfirmed: "Carinska stopa je proverena za tarifni broj proizvoda",
    assumptionTitle: "Važne pretpostavke",
    reviewWarning: "Nepotvrđene pretpostavke automatski označavaju kalkulaciju kao POTREBNA PROVERA.",
    transportTotal: "Ukupan transport i osiguranje",
    calculate: "Izračunaj stvarnu cenu",
    calculating: "Računanje...",
    legacyTransport: "Transport",
  },
  de: {
    goodsCost: "Warenwert",
    chinaDomesticTransport: "Inlandstransport in China",
    internationalTransport: "Internationaler Transport",
    insurance: "Transportversicherung",
    customsBroker: "Spediteur und Zollabfertigung",
    customsDuty: "Zoll",
    vat: "Mehrwertsteuer",
    inspection: "Warenkontrolle / Inspektion",
    storage: "Lagerung",
    other: "Sonstige Kosten",
    sellingPrice: "Geplanter Verkaufspreis",
    transportConfirmed: "Transportkosten sind durch ein Speditionsangebot bestätigt",
    customsConfirmed: "Der Zollsatz wurde für die Warentarifnummer geprüft",
    assumptionTitle: "Wichtige Annahmen",
    reviewWarning: "Nicht bestätigte Annahmen markieren die Kalkulation automatisch als PRÜFUNG ERFORDERLICH.",
    transportTotal: "Transport und Versicherung gesamt",
    calculate: "Tatsächliche Kosten berechnen",
    calculating: "Berechnung...",
    legacyTransport: "Transport",
  },
  en: {
    goodsCost: "Goods value",
    chinaDomesticTransport: "Domestic transport in China",
    internationalTransport: "International transport",
    insurance: "Transport insurance",
    customsBroker: "Freight forwarder and customs clearance",
    customsDuty: "Customs duty",
    vat: "VAT",
    inspection: "Goods inspection",
    storage: "Storage",
    other: "Other costs",
    sellingPrice: "Planned selling price",
    transportConfirmed: "Transport costs are confirmed by a freight quote",
    customsConfirmed: "The customs rate was checked for the product tariff code",
    assumptionTitle: "Important assumptions",
    reviewWarning: "Unconfirmed assumptions automatically mark the calculation as NEEDS REVIEW.",
    transportTotal: "Total transport and insurance",
    calculate: "Calculate true cost",
    calculating: "Calculating...",
    legacyTransport: "Transport",
  },
} satisfies Record<Locale, Record<string, string>>;

export function getLandedCostCopy(locale: Locale, targetCountry: string, defaultVatRate: string | null) {
  const countryCode = targetCountry.trim().toUpperCase();
  const countryName = countryNames[locale][countryCode] ?? countryCode;
  const vat = defaultVatRate ?? "—";
  const title = locale === "sr"
    ? `Stvarna cena do magacina u ${countryName}`
    : locale === "de"
      ? `Tatsächliche Kosten bis zum Lager in ${countryName}`
      : `True cost to the warehouse in ${countryName}`;
  const description = locale === "sr"
    ? `Unesite sve troškove od dobavljača u Kini do prijema robe u ${countryName}.`
    : locale === "de"
      ? `Erfassen Sie alle Kosten vom Lieferanten in China bis zum Wareneingang in ${countryName}.`
      : `Enter every cost from the supplier in China to receipt of the goods in ${countryName}.`;
  const assumptionText = locale === "sr"
    ? `PDV od ${vat}% je početna pretpostavka za ${countryName}. Carinska stopa, tarifni broj, transport i individualni poreski tretman moraju biti potvrđeni pre kupovine.`
    : locale === "de"
      ? `${vat}% Mehrwertsteuer ist eine anfängliche Annahme für ${countryName}. Zollsatz, Tarifnummer, Transport und die individuelle steuerliche Behandlung müssen vor dem Kauf bestätigt werden.`
      : `${vat}% VAT is an initial assumption for ${countryName}. The customs rate, tariff code, transport and individual tax treatment must be confirmed before purchase.`;

  return {
    ...labels[locale],
    title,
    description,
    assumptionText,
  };
}
