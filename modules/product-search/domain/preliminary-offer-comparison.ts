import {
  inquiryContactPriority,
  preliminaryAdvertisedScorePresentation,
  type InquiryContactPriority,
} from "./advertised-price-tie-break";
import {
  evaluateExplicitProductConstraintsForQueries,
  type ExplicitProductConstraintStatus,
} from "./explicit-product-constraints";
import {
  supplierOfferMarketplaceDetailsSchema,
  type SupplierOfferMarketplaceDetails,
} from "./marketplace-product-details";

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
  marketplaceDetails?: SupplierOfferMarketplaceDetails | null;
  /**
   * Unchanged search-analysis score. This is not an offer-assessment decision
   * score and is not written back to the saved search.
   */
  baseAnalysisScore?: number | null;
  confidenceScore?: number | null;
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
  priceIndicatorBonus: number;
  preliminaryDisplayedScore: number | null;
  confidenceScore: number | null;
};

export function readStoredMarketplaceDetails(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const parsed = supplierOfferMarketplaceDetailsSchema.safeParse(
    (metadata as Record<string, unknown>).marketplaceDetails,
  );
  return parsed.success ? parsed.data : null;
}

function positive(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Compares only evidence already stored for the selected offers.
 * An advertised price, including a source range, is not a purchase price and
 * cannot unlock a landed-cost figure.
 */
/**
 * Column order for the comparison. A conditional advertised-price priority
 * is display order only. It is not a confirmed purchase price or a landed
 * cost. When prices cannot be compared, the saved order stays unchanged.
 * Disqualified offers stay after the eligible ones.
 */
export function orderPreliminaryComparisonRows<T extends { id: string }>(
  rows: readonly T[],
  inquiry: Pick<InquiryContactPriority, "orderedIds" | "priceUsed">,
): T[] {
  if (!inquiry.priceUsed) return [...rows];
  const position = new Map(inquiry.orderedIds.map((id, index) => [id, index]));
  return [...rows].sort((left, right) =>
    (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
    (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function comparisonInquiryPriority(
  rows: ReadonlyArray<{
    id: string;
    suitability: PreliminaryComparisonRow["suitability"];
    priceCurrency: string | null;
    priceLow: number | null;
    listedMoq: number | null;
    purchasePriceConfirmed: boolean;
  }>,
) {
  return inquiryContactPriority(rows.map((row) => ({
    id: row.id,
    suitability: row.suitability,
    currency: row.purchasePriceConfirmed ? null : row.priceCurrency,
    advertisedPrice: row.purchasePriceConfirmed ? null : row.priceLow,
    listedMoq: row.listedMoq,
    confirmedPurchasePrice: row.purchasePriceConfirmed,
  })));
}

function finiteScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildPreliminaryOfferComparison(
  offers: PreliminaryComparisonInput[],
): PreliminaryComparisonRow[] {
  const drafted = offers.map((offer) => {
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
        {
          title: offer.title ?? offer.supplierName,
          marketplaceDetails: offer.marketplaceDetails ?? null,
        },
      ).status,
      priceEvidence,
      priceLow,
      priceHigh: priceEvidence === "ADVERTISED_RANGE" ? high : null,
      priceCurrency: priceLow === null ? null : currency,
      purchasePriceConfirmed: writtenQuote,
      landedCostAvailable: false as const,
      conditionalAdvertisedPrice: writtenQuote ? null : advertisedLow,
      conditionalCurrency: writtenQuote ? null : offer.advertisedCurrency,
      baseAnalysisScore: finiteScore(offer.baseAnalysisScore),
      confidenceScore: finiteScore(offer.confidenceScore),
    };
  });
  const presented = new Map(preliminaryAdvertisedScorePresentation(drafted.map((row) => ({
    id: row.id,
    suitability: row.suitability,
    currency: row.conditionalCurrency,
    advertisedPrice: row.conditionalAdvertisedPrice,
    listedMoq: row.listedMoq,
    confirmedPurchasePrice: row.purchasePriceConfirmed,
    baseScore: row.baseAnalysisScore ?? 0,
  }))).map((score) => [score.id, score]));

  return drafted.map((row) => {
    const score = presented.get(row.id);
    return {
      id: row.id,
      supplierName: row.supplierName,
      title: row.title,
      productUrl: row.productUrl,
      supplierCountry: row.supplierCountry,
      listedMoq: row.listedMoq,
      incoterm: row.incoterm,
      suitability: row.suitability,
      priceEvidence: row.priceEvidence,
      priceLow: row.priceLow,
      priceHigh: row.priceHigh,
      priceCurrency: row.priceCurrency,
      purchasePriceConfirmed: row.purchasePriceConfirmed,
      landedCostAvailable: row.landedCostAvailable,
      priceIndicatorBonus: row.baseAnalysisScore === null ? 0 : score?.priceIndicatorBonus ?? 0,
      preliminaryDisplayedScore: row.baseAnalysisScore === null
        ? null
        : score?.preliminaryDisplayedScore ?? row.baseAnalysisScore,
      confidenceScore: row.confidenceScore,
    };
  });
}
