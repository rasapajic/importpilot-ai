import type { ExplicitProductConstraintStatus } from "./explicit-product-constraints";

export const InquiryPriorityReasons = {
  CONDITIONAL_ADVERTISED: "CONDITIONAL_ADVERTISED",
  CURRENCY: "CURRENCY",
  INSUFFICIENT_PRICE: "INSUFFICIENT_PRICE",
} as const;

export type InquiryPriorityReason =
  (typeof InquiryPriorityReasons)[keyof typeof InquiryPriorityReasons];

export type AdvertisedPriceCandidate = {
  id: string;
  suitability: ExplicitProductConstraintStatus;
  currency: string | null;
  advertisedPrice: number | null;
  listedMoq: number | null;
  confirmedPurchasePrice: boolean;
};

export type InquiryContactPriority = {
  orderedIds: string[];
  /** Card numbers follow this order only as a quote-request priority. */
  priceUsed: boolean;
  reason: InquiryPriorityReason;
  priorityById: Record<string, number>;
  lowestAdvertisedId: string | null;
  excludedIds: string[];
};

/**
 * Provisional attractiveness only. The stored analysis score is not rewritten.
 * Lowest distinct conditional advertised price: +5. Any price strictly between
 * the lowest and the highest: +2. Highest: +0. The same price shares one bonus.
 * The shown score cannot pass 100. Data confidence is not an input.
 */
export const CONDITIONAL_ADVERTISED_SCORE_BONUS = {
  lowest: 5,
  between: 2,
  highest: 0,
  maximumScore: 100,
} as const;

export type PreliminaryAdvertisedScore = {
  id: string;
  baseScore: number;
  priceIndicatorBonus: number;
  preliminaryDisplayedScore: number;
  /** True only when this offer's advertised price was inside the comparison. */
  priceCompared: boolean;
};

function hasAdvertisedPrice(offer: AdvertisedPriceCandidate) {
  return offer.advertisedPrice !== null &&
    Number.isFinite(offer.advertisedPrice) &&
    offer.advertisedPrice > 0 &&
    Boolean(offer.currency) &&
    !offer.confirmedPurchasePrice;
}

function clampDisplayedScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    CONDITIONAL_ADVERTISED_SCORE_BONUS.maximumScore,
    Math.max(0, Math.round(value)),
  );
}

/**
 * Orders suppliers for a quote request. A hard product mismatch stays out of
 * that order. Among the rest, the same currency and an advertised unit price
 * set a conditional priority. A different listing MOQ does not prove the order
 * and does not block the priority. Mixed currencies or missing prices leave
 * the saved order unchanged. This is not a confirmed purchase price or a
 * landed cost.
 */
export function inquiryContactPriority(
  offers: readonly AdvertisedPriceCandidate[],
): InquiryContactPriority {
  const excluded = offers.filter((offer) => offer.suitability === "DISQUALIFIED");
  const contenders = offers.filter((offer) => offer.suitability !== "DISQUALIFIED");
  const priced = contenders.filter(hasAdvertisedPrice);
  const currencies = new Set(priced.map((offer) => offer.currency));
  const priceUsed = priced.length >= 2 && currencies.size === 1;
  const reason = priced.length < 2
    ? InquiryPriorityReasons.INSUFFICIENT_PRICE
    : currencies.size === 1
      ? InquiryPriorityReasons.CONDITIONAL_ADVERTISED
      : InquiryPriorityReasons.CURRENCY;
  const orderedContenders = priceUsed
    ? [...contenders].sort((left, right) => {
        const leftMissing = !hasAdvertisedPrice(left);
        const rightMissing = !hasAdvertisedPrice(right);
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        return (left.advertisedPrice ?? Number.POSITIVE_INFINITY) -
          (right.advertisedPrice ?? Number.POSITIVE_INFINITY);
      })
    : [...contenders];
  const priorityById: Record<string, number> = {};
  if (priceUsed) {
    let position = 1;
    for (const offer of orderedContenders) {
      if (!hasAdvertisedPrice(offer)) continue;
      priorityById[offer.id] = position;
      position += 1;
    }
  }
  const pricedValues = priced.flatMap((offer) => (
    offer.advertisedPrice === null ? [] : [offer.advertisedPrice]
  ));
  const lowestPrice = pricedValues.length > 0 ? Math.min(...pricedValues) : null;
  const lowestOffers = priced.filter((offer) => offer.advertisedPrice === lowestPrice);
  const lowest = priceUsed && lowestOffers.length === 1 ? lowestOffers[0] : null;

  return {
    orderedIds: [...orderedContenders, ...excluded].map((offer) => offer.id),
    priceUsed,
    reason,
    priorityById,
    lowestAdvertisedId: lowest?.id ?? null,
    excludedIds: excluded.map((offer) => offer.id),
  };
}

function bonusForDistinctPrice(price: number, uniqueAscending: readonly number[]) {
  if (uniqueAscending.length < 2) return CONDITIONAL_ADVERTISED_SCORE_BONUS.highest;
  const index = uniqueAscending.indexOf(price);
  if (index <= 0) return CONDITIONAL_ADVERTISED_SCORE_BONUS.lowest;
  if (index === uniqueAscending.length - 1) return CONDITIONAL_ADVERTISED_SCORE_BONUS.highest;
  return CONDITIONAL_ADVERTISED_SCORE_BONUS.between;
}

/**
 * Adds a capped conditional bonus for the same offers the inquiry order may
 * sort by advertised price. A hard mismatch, a confirmed purchase price, a
 * missing or invalid price, or mixed currencies get no bonus. The returned
 * score is for display. Callers keep the stored score and the confidence.
 */
export function preliminaryAdvertisedScorePresentation(
  offers: readonly (AdvertisedPriceCandidate & { baseScore: number })[],
): PreliminaryAdvertisedScore[] {
  const priority = inquiryContactPriority(offers);
  const compared = priority.priceUsed
    ? offers.filter((offer) => offer.suitability !== "DISQUALIFIED" && hasAdvertisedPrice(offer))
    : [];
  const uniqueAscending = [...new Set(compared.flatMap((offer) => (
    offer.advertisedPrice === null ? [] : [offer.advertisedPrice]
  )))].sort((left, right) => left - right);

  return offers.map((offer) => {
    const priceCompared = compared.some((candidate) => candidate.id === offer.id);
    const priceIndicatorBonus = priceCompared && offer.advertisedPrice !== null
      ? bonusForDistinctPrice(offer.advertisedPrice, uniqueAscending)
      : 0;
    return {
      id: offer.id,
      baseScore: offer.baseScore,
      priceIndicatorBonus,
      preliminaryDisplayedScore: clampDisplayedScore(offer.baseScore + priceIndicatorBonus),
      priceCompared,
    };
  });
}
