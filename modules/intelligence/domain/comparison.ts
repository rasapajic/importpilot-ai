import type { RecommendationStatusValue } from "./recommendation";
import {
  rankOffersForCountry,
  LUNA_COUNTRY_RANKING_VERSION,
  type LunaCountryRankedOffer,
} from "./luna-country-ranking";
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
  landedCostPerUnit?: number | null;
  grossMarginPercent: number | null;
  deliveryTimeDays: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
  confidenceScore?: number | null;
  recommendationStatus: RecommendationStatusValue | null;
  calculationTargetCountry?: string | null;
  calculationStatus?: "CALCULATED" | "NEEDS_REVIEW" | "DRAFT" | null;
  landedCostTotalEur?: number | null;
};

export type ComparisonGroup = {
  currency: string;
  offers: ComparableOffer[];
  bestTotalCost: ComparableOffer | null;
  lowestRisk: ComparableOffer | null;
  fastestDelivery: ComparableOffer | null;
  bestForResale: ComparableOffer | null;
  targetCountry: string | null;
  lunaRankingVersion: typeof LUNA_COUNTRY_RANKING_VERSION | null;
  lunaRanking: LunaCountryRankedOffer[];
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
  rankingContext?: { targetCountry: string; targetMarginPercent: number },
): ComparisonGroup[] {
  const comparable = offers.flatMap((offer) => {
    if (!offer.currency || offer.recommendationStatus === null) return [];
    const landedCostTotalEur = offer.landedCostTotal === null
      ? null
      : convertToEur(offer.landedCostTotal, offer.currency, fx);
    if (offer.landedCostTotal !== null && landedCostTotalEur === null) return [];
    return [{ ...offer, landedCostTotalEur }];
  });
  const lunaRanking = rankingContext
    ? rankOffersForCountry({
        targetCountry: rankingContext.targetCountry,
        targetMarginPercent: rankingContext.targetMarginPercent,
        offers: offers.map((offer) => ({
          offerId: offer.offerId,
          supplierName: offer.supplierName,
          currency: offer.currency,
          calculationTargetCountry: offer.calculationTargetCountry ?? null,
          calculationStatus: offer.calculationStatus ?? null,
          landedCostPerUnit: offer.landedCostPerUnit ?? null,
          grossMarginPercent: offer.grossMarginPercent,
          supplierRiskScore: offer.supplierRiskScore,
          overallScore: offer.overallScore,
          confidenceScore: offer.confidenceScore ?? null,
          deliveryTimeDays: offer.deliveryTimeDays,
          recommendationStatus: offer.recommendationStatus,
        })),
      }, fx)
    : [];
  if (comparable.length === 0 && lunaRanking.length === 0) return [];

  return [{
    currency: "EUR",
    offers: comparable,
    bestTotalCost: minByWithRiskTieBreak(comparable, (offer) => offer.landedCostTotalEur ?? null),
    lowestRisk: minBy(comparable, (offer) => offer.supplierRiskScore),
    fastestDelivery: minBy(comparable, (offer) => offer.deliveryTimeDays),
    bestForResale: maxByWithRiskTieBreak(comparable, (offer) => offer.grossMarginPercent),
    targetCountry: rankingContext?.targetCountry ?? null,
    lunaRankingVersion: rankingContext ? LUNA_COUNTRY_RANKING_VERSION : null,
    lunaRanking,
  }];
}
