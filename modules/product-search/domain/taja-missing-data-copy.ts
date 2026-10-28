import type { Locale } from "@/modules/i18n/translations";

const LABELS: Record<Locale, Record<string, string>> = {
  sr: {
    LANDED_COST: "potvrđen ukupan trošak uvoza",
    SUPPLIER_VERIFICATION: "verifikacija dobavljača",
    SUPPLIER_RISK_DATA: "dovoljno podataka o riziku",
    DELIVERY_TIME: "rok isporuke",
    SAMPLE_AVAILABILITY: "dostupnost uzorka",
    COMMERCIAL_TERMS: "komercijalni uslovi",
    TRANSPORT_DETAILS: "detalji transporta",
    CORE_OFFER_DATA: "osnovni podaci ponude",
    PRODUCT_REQUIREMENTS: "potvrda traženih osobina proizvoda",
    PRICE_BASIS: "potvrda cenovne jedinice",
  },
  de: {
    LANDED_COST: "bestätigte Landed Costs",
    SUPPLIER_VERIFICATION: "Lieferantenverifizierung",
    SUPPLIER_RISK_DATA: "ausreichende Risikodaten",
    DELIVERY_TIME: "Lieferzeit",
    SAMPLE_AVAILABILITY: "Musterverfügbarkeit",
    COMMERCIAL_TERMS: "Geschäftsbedingungen",
    TRANSPORT_DETAILS: "Transportdetails",
    CORE_OFFER_DATA: "Kerndaten des Angebots",
    PRODUCT_REQUIREMENTS: "Bestätigung der gewünschten Produkteigenschaften",
    PRICE_BASIS: "Bestätigung der Preiseinheit",
  },
  en: {
    LANDED_COST: "confirmed landed cost",
    SUPPLIER_VERIFICATION: "supplier verification",
    SUPPLIER_RISK_DATA: "sufficient risk evidence",
    DELIVERY_TIME: "delivery time",
    SAMPLE_AVAILABILITY: "sample availability",
    COMMERCIAL_TERMS: "commercial terms",
    TRANSPORT_DETAILS: "transport details",
    CORE_OFFER_DATA: "core offer data",
    PRODUCT_REQUIREMENTS: "confirmation of the requested product details",
    PRICE_BASIS: "confirmation of the price basis",
  },
};

const FALLBACK: Record<Locale, string> = {
  sr: "dodatni podatak",
  de: "weitere Angabe",
  en: "additional detail",
};

export function missingDataLabel(key: string, locale: Locale) {
  return LABELS[locale][key] ?? FALLBACK[locale];
}

export function formatMissingDataLabels(keys: readonly string[], locale: Locale) {
  return keys.map((key) => missingDataLabel(key, locale)).join(", ");
}
