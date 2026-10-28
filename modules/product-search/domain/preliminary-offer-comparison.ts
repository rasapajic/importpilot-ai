import {
  evaluateExplicitProductConstraintsForQueries,
  type ExplicitProductConstraintStatus,
} from "./explicit-product-constraints";

export type PreliminaryComparisonPriceEvidence =
  | "CONFIRMED_QUOTE"
  | "ADVERTISED_RANGE"
  | "ADVERTISED_PRICE"
  | "UNKNOWN";

export type PreliminaryComparisonInput = {
  id: string;
  supplierName: string;
  title: string | null;
  productUrl: string | null;
  supplierCountry: string | null;
  listedMoq: number | null;
  incoterm: string | null;
  unitPrice: number | null;
  currency: string | null;
  advertisedPrice: number | null;
  advertisedCurrency: string | null;
  advertisedPriceHigh: number | null;
  writtenQuoteConfirmed: boolean;
  productQuery: string;
};

export type PreliminaryComparisonRow = {
  id: string;
  supplierName: string;
  title: string | null;
  productUrl: string | null;
  supplierCountry: string | null;
  listedMoq: number | null;
  incoterm: string | null;
  suitability: ExplicitProductConstraintStatus;
  priceEvidence: PreliminaryComparisonPriceEvidence;
  priceLow: number | null;
  priceHigh: number | null;
  priceCurrency: string | null;
  purchasePriceConfirmed: boolean;
  landedCostAvailable: false;
};

function positive(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Compares only evidence already stored for the selected offers.
 * An advertised price, including a source range, is not a purchase price and
 * cannot unlock a landed-cost figure.
 */
export function buildPreliminaryOfferComparison(
  offers: PreliminaryComparisonInput[],
): PreliminaryComparisonRow[] {
  return offers.map((offer) => {
    const advertisedLow = positive(offer.advertisedPrice);
    const advertisedHigh = positive(offer.advertisedPriceHigh);
    const storedPrice = positive(offer.unitPrice);
    const writtenQuote = offer.writtenQuoteConfirmed && storedPrice !== null && Boolean(offer.currency);
    const high = advertisedLow !== null &&
      advertisedHigh !== null &&
      advertisedHigh > advertisedLow
      ? advertisedHigh
      : null;
    const priceEvidence: PreliminaryComparisonPriceEvidence = writtenQuote
      ? "CONFIRMED_QUOTE"
      : high !== null
        ? "ADVERTISED_RANGE"
        : advertisedLow !== null
          ? "ADVERTISED_PRICE"
          : storedPrice !== null
            ? "ADVERTISED_PRICE"
            : "UNKNOWN";
    const priceLow = writtenQuote
      ? storedPrice
      : advertisedLow ?? storedPrice;
    const currency = writtenQuote || advertisedLow === null
      ? offer.currency
      : offer.advertisedCurrency;

    return {
      id: offer.id,
      supplierName: offer.supplierName,
      title: offer.title,
      productUrl: offer.productUrl,
      supplierCountry: offer.supplierCountry,
      listedMoq: offer.listedMoq,
      incoterm: offer.incoterm,
      suitability: evaluateExplicitProductConstraintsForQueries(
        [offer.productQuery],
        { title: offer.title ?? offer.supplierName, marketplaceDetails: null },
      ).status,
      priceEvidence,
      priceLow,
      priceHigh: priceEvidence === "ADVERTISED_RANGE" ? high : null,
      priceCurrency: priceLow === null ? null : currency,
      purchasePriceConfirmed: writtenQuote,
      landedCostAvailable: false,
    };
  });
}
