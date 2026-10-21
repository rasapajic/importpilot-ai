import type { Locale } from "@/modules/i18n/translations";

export type SupplierPriceEvidence = "MARKETPLACE_SEARCH" | "PRODUCT_PAGE";

/**
 * A price read from a marketplace search result is not an independent
 * confirmation. Only a completed exact-page review may be presented as confirmed.
 */
export function displayedSupplierPriceEvidence(result: {
  price: number | null;
  currency: string | null;
  priceEvidence?: SupplierPriceEvidence | null;
}): SupplierPriceEvidence | null {
  if (result.price === null || result.currency === null) return null;
  return result.priceEvidence === "PRODUCT_PAGE" ? "PRODUCT_PAGE" : "MARKETPLACE_SEARCH";
}

const labels: Record<Locale, Record<SupplierPriceEvidence, string>> = {
  sr: {
    MARKETPLACE_SEARCH: "Očitano iz rezultata pretrage. Nije posebno potvrđeno pregledom stranice ponude.",
    PRODUCT_PAGE: "Potvrđeno pregledom kompletne stranice ponude. Nije ponuda dobavljača za konkretnu narudžbinu.",
  },
  de: {
    MARKETPLACE_SEARCH: "Aus dem Suchergebnis gelesen. Nicht gesondert durch die vollständige Angebotsseite bestätigt.",
    PRODUCT_PAGE: "Durch Prüfung der vollständigen Angebotsseite bestätigt. Kein Lieferantenangebot für diesen konkreten Auftrag.",
  },
  en: {
    MARKETPLACE_SEARCH: "Read from the search result. Not separately confirmed by reviewing the complete offer page.",
    PRODUCT_PAGE: "Confirmed by reviewing the complete offer page. Not a supplier quotation for this specific order.",
  },
};

export function supplierPriceEvidenceLabel(
  evidence: SupplierPriceEvidence | null,
  locale: Locale,
) {
  if (!evidence) return null;
  return labels[locale][evidence];
}
