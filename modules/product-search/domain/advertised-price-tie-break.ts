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

function hasAdvertisedPrice(offer: AdvertisedPriceCandidate) {
  return offer.advertisedPrice !== null &&
    offer.advertisedPrice > 0 &&
    Boolean(offer.currency) &&
    !offer.confirmedPurchasePrice;
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
  orderedContenders.forEach((offer, index) => {
    priorityById[offer.id] = index + 1;
  });
  const lowest = priceUsed
    ? orderedContenders.find(hasAdvertisedPrice) ?? null
    : null;

  return {
    orderedIds: [...orderedContenders, ...excluded].map((offer) => offer.id),
    priceUsed,
    reason,
    priorityById,
    lowestAdvertisedId: lowest?.id ?? null,
    excludedIds: excluded.map((offer) => offer.id),
  };
}
