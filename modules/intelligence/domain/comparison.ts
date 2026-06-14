import type { RecommendationStatusValue } from "./recommendation";
import {
  convertToEur,
  DEFAULT_EUR_FX_SNAPSHOT,
  type FxSnapshot,
} from "../../fx/euro-display";

export type ComparableOffer = {
  offerId: string;
  supplierName: string;
  currency: string | null;
  landedCostTotal: number | null;
  grossMarginPercent: number | null;
  deliveryTimeDays: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
  recommendationStatus: RecommendationStatusValue | null;
  landedCostTotalEur?: number | null;
};

export type ComparisonGroup = {
  currency: string;
  offers: ComparableOffer[];
  bestTotalCost: ComparableOffer | null;
  lowestRisk: ComparableOffer | null;
  fastestDelivery: ComparableOffer | null;
  bestForResale: ComparableOffer | null;
};

function minBy(items: ComparableOffer[], value: (item: ComparableOffer) => number | null) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => value(a)! - value(b)!)[0] ?? null;
}

function riskValue(item: ComparableOffer) {
  return item.supplierRiskScore ?? Number.MAX_SAFE_INTEGER;
}

function minByWithRiskTieBreak(
  items: ComparableOffer[],
  value: (item: ComparableOffer) => number | null,
) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => {
      const first = value(a)!;
      const second = value(b)!;
      const tolerance = Math.max(1, Math.abs(first) * 0.03);
      if (Math.abs(first - second) <= tolerance) return riskValue(a) - riskValue(b);
      return first - second;
    })[0] ?? null;
}

function maxByWithRiskTieBreak(
  items: ComparableOffer[],
  value: (item: ComparableOffer) => number | null,
) {
  return items
    .filter((item) => value(item) !== null)
    .sort((a, b) => {
      const first = value(a)!;
      const second = value(b)!;
      if (Math.abs(first - second) <= 2) return riskValue(a) - riskValue(b);
      return second - first;
    })[0] ?? null;
}

export function compareOffers(
  offers: ComparableOffer[],
  fx: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
): ComparisonGroup[] {
  const comparable = offers.flatMap((offer) => {
    if (!offer.currency || offer.recommendationStatus === null) return [];
    const landedCostTotalEur = offer.landedCostTotal === null
      ? null
      : convertToEur(offer.landedCostTotal, offer.currency, fx);
    if (offer.landedCostTotal !== null && landedCostTotalEur === null) return [];
    return [{ ...offer, landedCostTotalEur }];
  });
  if (comparable.length === 0) return [];

  return [{
    currency: "EUR",
    offers: comparable,
    bestTotalCost: minByWithRiskTieBreak(comparable, (offer) => offer.landedCostTotalEur ?? null),
    lowestRisk: minBy(comparable, (offer) => offer.supplierRiskScore),
    fastestDelivery: minBy(comparable, (offer) => offer.deliveryTimeDays),
    bestForResale: maxByWithRiskTieBreak(comparable, (offer) => offer.grossMarginPercent),
  }];
}
