import type { Locale } from "../../i18n/translations";
import {
  supplierOfferMarketplacePriceEvidenceSchema,
  type SupplierOfferUrlPreview,
} from "./search";

const copy = {
  sr: {
    one: "Raspon iz kataloga dobavljača — jedan izvor",
    two: "Raspon iz dve objave iste platforme",
    warning: "Javno oglašena cena, nije pisana ponuda i nije potvrđena cena za traženu količinu.",
    catalog: "Katalog dobavljača",
    video: "Video-stranica proizvoda",
    unit: { Piece: "kom.", Set: "set", Unit: "jed." },
  },
  de: {
    one: "Preisspanne aus Lieferantenkatalog — eine Quelle",
    two: "Preisspanne aus zwei Einträgen derselben Plattform",
    warning: "Öffentliche Preisangabe, kein verbindliches Angebot für die gewünschte Menge.",
    catalog: "Lieferantenkatalog",
    video: "Produkt-Videoseite",
    unit: { Piece: "Stk.", Set: "Set", Unit: "Einheit" },
  },
  en: {
    one: "Seller catalog price range — one source",
    two: "Range from two listings on the same platform",
    warning: "Publicly advertised only; not a written quote or confirmed price for the requested quantity.",
    catalog: "Supplier catalog",
    video: "Product video listing",
    unit: { Piece: "pc", Set: "set", Unit: "unit" },
  },
} as const;

export type PublicPriceEvidenceDisplay = {
  label: string;
  range: string;
  warning: string;
  sourceLinks: readonly { label: string; href: string }[];
  sourceCount: 1 | 2;
};

/**
 * This format is READ-ONLY and deliberately separate from price tiers,
 * supplier quotes, order valuation, rankings and landed-cost calculation.
 */
export function marketplacePublicPriceEvidenceDisplay(
  preview: SupplierOfferUrlPreview,
  locale: Locale,
): PublicPriceEvidenceDisplay | null {
  const source = supplierOfferMarketplacePriceEvidenceSchema.safeParse(
    preview.marketplacePriceEvidence ?? null,
  );
  if (!source.success) return null;
  const evidence = source.data;
  if (evidence.productUrl !== preview.productUrl ||
      preview.minimumOrderQuantity === null ||
      evidence.minimumOrderQuantity !== preview.minimumOrderQuantity ||
      (preview.currency !== null && evidence.currency !== preview.currency) ||
      (preview.advertisedPriceRange &&
       (preview.advertisedPriceRange.lowPrice !== evidence.lowPrice ||
        preview.advertisedPriceRange.highPrice !== evidence.highPrice ||
        preview.advertisedPriceRange.currency !== evidence.currency))) return null;

  const labels = copy[locale];
  const fmt = new Intl.NumberFormat(
    locale === "sr" ? "sr-RS" : locale === "de" ? "de-DE" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 4 },
  );
  const unit = labels.unit[evidence.unit];
  const range = fmt.format(evidence.lowPrice) + "–" +
    fmt.format(evidence.highPrice) + " " + evidence.currency + "/" + unit;
  if (evidence.kind === "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE") {
    return {
      label: labels.one,
      range,
      warning: labels.warning,
      sourceLinks: [{ label: labels.catalog, href: evidence.sourceUrl }],
      sourceCount: 1,
    };
  }
  return {
    label: labels.two,
    range,
    warning: labels.warning,
    sourceLinks: [
      { label: labels.video, href: evidence.evidence[0] },
      { label: labels.catalog, href: evidence.evidence[1] },
    ],
    sourceCount: 2,
  };
}
