import type { Locale } from "../../i18n/translations";
import type { SupplierOfferUrlPreview } from "./search";

const labels = {
  sr: {
    prefix: "Oglašeni raspon za ovaj proizvod",
    warning: "Nije potvrđena cena za traženu količinu niti pisana ponuda dobavljača.",
    unit: { Piece: "kom.", Set: "set", Unit: "jed." },
  },
  de: {
    prefix: "Angegebene Preisspanne für dieses Produkt",
    warning: "Kein bestätigter Preis für die gewünschte Menge und kein verbindliches Angebot.",
    unit: { Piece: "Stk.", Set: "Set", Unit: "Einheit" },
  },
  en: {
    prefix: "Advertised range for this exact product",
    warning: "Not a confirmed price for the requested quantity or a written supplier quote.",
    unit: { Piece: "pc", Set: "set", Unit: "unit" },
  },
} as const;

/**
 * Presentation ONLY. A source-linked public aggregate range cannot be used
 * as a quantity tier, firm quote, price ranking, or landed-cost input.
 */
export function advertisedRangeDisplay(preview: SupplierOfferUrlPreview, locale: Locale): string | null {
  const range = preview.advertisedPriceRange;
  if (!range || range.sourceUrl !== preview.productUrl ||
      (preview.currency !== null && range.currency !== preview.currency) ||
      !Number.isFinite(range.lowPrice) || !Number.isFinite(range.highPrice) ||
      range.lowPrice <= 0 || range.highPrice <= range.lowPrice ||
      range.evidence !== "EXACT_PRODUCT_JSONLD") return null;
  const copy = labels[locale];
  const language = locale === "sr" ? "sr-RS" : locale === "de" ? "de-DE" : "en-US";
  const fmt = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const unit = range.unit ? "/" + copy.unit[range.unit] : "";
  return copy.prefix + ": " + fmt.format(range.lowPrice) + "–" +
    fmt.format(range.highPrice) + " " + range.currency + unit + ". " + copy.warning;
}
