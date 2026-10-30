import type { ExplicitProductConstraintStatus } from "./explicit-product-constraints";

export const AdvertisedPriceTieBreakReasons = {
  COMPARABLE: "COMPARABLE",
  SPEC_UNCONFIRMED: "SPEC_UNCONFIRMED",
  CURRENCY: "CURRENCY",
  QUANTITY_TIER: "QUANTITY_TIER",
  NO_ADVERTISED_PRICE: "NO_ADVERTISED_PRICE",
} as const;

export type AdvertisedPriceTieBreakReason =
  (typeof AdvertisedPriceTieBreakReasons)[keyof typeof AdvertisedPriceTieBreakReasons];

export type AdvertisedPriceCandidate = {
  id: string;
  suitability: ExplicitProductConstraintStatus;
  currency: string | null;
  advertisedPrice: number | null;
  listedMoq: number | null;
  confirmedPurchasePrice: boolean;
};

export type AdvertisedPriceTieBreakAssessment = {
  /** True only when a weak advertised-price order would be allowed. Not applied by the live ranker. */
  useAsTieBreak: boolean;
  informationalOnly: boolean;
  reason: AdvertisedPriceTieBreakReason;
  lowestAdvertisedId: string | null;
};

function lowestPriced(offers: readonly AdvertisedPriceCandidate[]) {
  return offers.reduce<AdvertisedPriceCandidate | null>((lowest, offer) => {
    if (offer.advertisedPrice === null || offer.advertisedPrice <= 0 || !offer.currency) return lowest;
    if (!lowest || offer.advertisedPrice < (lowest.advertisedPrice ?? Number.POSITIVE_INFINITY)) return offer;
    return lowest;
  }, null);
}

/**
 * Decides whether an advertised unit price may later break a tie.
 * It does not change saved order. A disqualified product is ignored.
 * Unknown lens type, mixed currencies, or different listing MOQs keep the
 * lowest teaser informational: it is not a confirmed quote or a landed cost.
 */
export function assessAdvertisedPriceTieBreak(
  offers: readonly AdvertisedPriceCandidate[],
): AdvertisedPriceTieBreakAssessment {
  const contenders = offers.filter((offer) => offer.suitability !== "DISQUALIFIED" && !offer.confirmedPurchasePrice);
  const lowest = lowestPriced(contenders);
  if (!lowest) {
    return {
      useAsTieBreak: false,
      informationalOnly: false,
      reason: AdvertisedPriceTieBreakReasons.NO_ADVERTISED_PRICE,
      lowestAdvertisedId: null,
    };
  }

  const specsConfirmed = contenders.length >= 2 && contenders.every((offer) => offer.suitability === "COMPATIBLE");
  const priced = contenders.filter((offer) => offer.advertisedPrice !== null && offer.advertisedPrice > 0 && offer.currency);
  const currencies = new Set(priced.map((offer) => offer.currency));
  const moqs = priced.map((offer) => offer.listedMoq);
  const sameCurrency = currencies.size === 1;
  const sameQuantityTier = moqs.length >= 2 && moqs.every((moq) => moq !== null && moq === moqs[0]);
  const comparable = specsConfirmed && sameCurrency && sameQuantityTier;

  const reason = !specsConfirmed
    ? AdvertisedPriceTieBreakReasons.SPEC_UNCONFIRMED
    : !sameCurrency
      ? AdvertisedPriceTieBreakReasons.CURRENCY
      : !sameQuantityTier
        ? AdvertisedPriceTieBreakReasons.QUANTITY_TIER
        : AdvertisedPriceTieBreakReasons.COMPARABLE;

  return {
    useAsTieBreak: comparable,
    informationalOnly: !comparable,
    reason,
    lowestAdvertisedId: lowest.id,
  };
}

/** Optional order. Callers must not use this until a product decision turns the tie-break on. */
export function orderByOptionalAdvertisedTieBreak<T extends AdvertisedPriceCandidate>(offers: readonly T[]) {
  const assessment = assessAdvertisedPriceTieBreak(offers);
  if (!assessment.useAsTieBreak) return [...offers];
  return [...offers].sort((left, right) => {
    if (left.suitability === "DISQUALIFIED" && right.suitability !== "DISQUALIFIED") return 1;
    if (right.suitability === "DISQUALIFIED" && left.suitability !== "DISQUALIFIED") return -1;
    return (left.advertisedPrice ?? Number.POSITIVE_INFINITY) - (right.advertisedPrice ?? Number.POSITIVE_INFINITY);
  });
}
