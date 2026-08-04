import {
  convertToEur,
  DEFAULT_EUR_FX_SNAPSHOT,
  type FxSnapshot,
} from "../../fx/euro-display";
import type { RecommendationStatusValue } from "./recommendation";

export type LunaCalculationStatus = "DRAFT" | "CALCULATED" | "NEEDS_REVIEW";
export type LunaRankingStatus = "RANKED" | "NEEDS_REVIEW" | "NOT_READY";

export type LunaRankingMissingData =
  | "CALCULATION"
  | "CURRENCY"
  | "LANDED_COST"
  | "GROSS_MARGIN"
  | "ASSESSMENT"
  | "SUPPLIER_RISK"
  | "FX_RATE";

export type LunaRankingReasonCode =
  | "TOP_CONFIRMED_OFFER"
  | "CONFIRMED_COST"
  | "TARGET_MARGIN_MET"
  | "RECOMMENDED"
  | "LOW_RISK"
  | "LOWEST_CONFIRMED_COST"
  | "UNCONFIRMED_COST_ASSUMPTIONS"
  | "MISSING_DATA";

export type LunaRankingOfferInput = {
  offerId: string;
  supplierName: string;
  currency: string | null;
  calculationStatus?: LunaCalculationStatus | null;
  landedCostPerUnit?: number | null;
  grossMarginPercent: number | null;
  deliveryTimeDays: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
  recommendationStatus: RecommendationStatusValue | null;
};

export type LunaRankedOffer = LunaRankingOfferInput & {
  status: LunaRankingStatus;
  rank: number | null;
  landedCostPerUnitEur: number | null;
  missingData: LunaRankingMissingData[];
  reasonCodes: LunaRankingReasonCode[];
};

export type LunaRankingResult = {
  ranked: LunaRankedOffer[];
  needsReview: LunaRankedOffer[];
  notReady: LunaRankedOffer[];
  targetMarginPercent: number;
};

const recommendationPriority: Record<RecommendationStatusValue, number> = {
  RECOMMENDED: 4,
  OK_WITH_RISK: 3,
  NEEDS_NEGOTIATION: 2,
  NOT_RECOMMENDED: 1,
};

function numericDescending(first: number | null, second: number | null) {
  return (second ?? Number.NEGATIVE_INFINITY) - (first ?? Number.NEGATIVE_INFINITY);
}

function numericAscending(first: number | null, second: number | null) {
  return (first ?? Number.POSITIVE_INFINITY) - (second ?? Number.POSITIVE_INFINITY);
}

function compareRankableOffers(first: LunaRankedOffer, second: LunaRankedOffer) {
  const recommendationDifference =
    (second.recommendationStatus ? recommendationPriority[second.recommendationStatus] : 0) -
    (first.recommendationStatus ? recommendationPriority[first.recommendationStatus] : 0);
  if (recommendationDifference !== 0) return recommendationDifference;

  const scoreDifference = numericDescending(first.overallScore, second.overallScore);
  if (scoreDifference !== 0) return scoreDifference;

  const marginDifference = numericDescending(first.grossMarginPercent, second.grossMarginPercent);
  if (marginDifference !== 0) return marginDifference;

  const costDifference = numericAscending(first.landedCostPerUnitEur, second.landedCostPerUnitEur);
  if (costDifference !== 0) return costDifference;

  const riskDifference = numericAscending(first.supplierRiskScore, second.supplierRiskScore);
  if (riskDifference !== 0) return riskDifference;

  const deliveryDifference = numericAscending(first.deliveryTimeDays, second.deliveryTimeDays);
  if (deliveryDifference !== 0) return deliveryDifference;

  return first.supplierName.localeCompare(second.supplierName);
}

function missingDataForOffer(
  offer: LunaRankingOfferInput,
  landedCostPerUnitEur: number | null,
): LunaRankingMissingData[] {
  const missing: LunaRankingMissingData[] = [];
  if (!offer.calculationStatus) missing.push("CALCULATION");
  if (!offer.currency) missing.push("CURRENCY");
  if (offer.landedCostPerUnit === null || offer.landedCostPerUnit === undefined) {
    missing.push("LANDED_COST");
  } else if (landedCostPerUnitEur === null) {
    missing.push("FX_RATE");
  }
  if (offer.grossMarginPercent === null) missing.push("GROSS_MARGIN");
  if (offer.overallScore === null || offer.recommendationStatus === null) missing.push("ASSESSMENT");
  if (offer.supplierRiskScore === null) missing.push("SUPPLIER_RISK");
  return missing;
}

function prepareOffer(
  offer: LunaRankingOfferInput,
  fx: FxSnapshot,
): LunaRankedOffer {
  const landedCostPerUnitEur =
    offer.currency && offer.landedCostPerUnit !== null && offer.landedCostPerUnit !== undefined
      ? convertToEur(offer.landedCostPerUnit, offer.currency, fx)
      : null;
  const missingData = missingDataForOffer(offer, landedCostPerUnitEur);
  const status: LunaRankingStatus = missingData.length > 0
    ? "NOT_READY"
    : offer.calculationStatus === "CALCULATED"
      ? "RANKED"
      : "NEEDS_REVIEW";

  return {
    ...offer,
    status,
    rank: null,
    landedCostPerUnitEur,
    missingData,
    reasonCodes: status === "NEEDS_REVIEW"
      ? ["UNCONFIRMED_COST_ASSUMPTIONS"]
      : status === "NOT_READY"
        ? ["MISSING_DATA"]
        : ["CONFIRMED_COST"],
  };
}

export function rankLunaOffers(
  offers: LunaRankingOfferInput[],
  targetMarginPercent: number,
  fx: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
): LunaRankingResult {
  const prepared = offers.map((offer) => prepareOffer(offer, fx));
  const ranked = prepared
    .filter((offer) => offer.status === "RANKED")
    .sort(compareRankableOffers);
  const lowestConfirmedCost = ranked.reduce<number | null>(
    (lowest, offer) => offer.landedCostPerUnitEur === null
      ? lowest
      : lowest === null
        ? offer.landedCostPerUnitEur
        : Math.min(lowest, offer.landedCostPerUnitEur),
    null,
  );

  const rankedWithReasons = ranked.map((offer, index) => {
    const reasonCodes: LunaRankingReasonCode[] = [...offer.reasonCodes];
    if (index === 0) reasonCodes.push("TOP_CONFIRMED_OFFER");
    if (
      offer.grossMarginPercent !== null &&
      offer.grossMarginPercent >= targetMarginPercent
    ) {
      reasonCodes.push("TARGET_MARGIN_MET");
    }
    if (offer.recommendationStatus === "RECOMMENDED") reasonCodes.push("RECOMMENDED");
    if (offer.supplierRiskScore !== null && offer.supplierRiskScore <= 30) {
      reasonCodes.push("LOW_RISK");
    }
    if (
      lowestConfirmedCost !== null &&
      offer.landedCostPerUnitEur === lowestConfirmedCost
    ) {
      reasonCodes.push("LOWEST_CONFIRMED_COST");
    }
    return { ...offer, rank: index + 1, reasonCodes };
  });

  return {
    ranked: rankedWithReasons,
    needsReview: prepared
      .filter((offer) => offer.status === "NEEDS_REVIEW")
      .sort(compareRankableOffers),
    notReady: prepared
      .filter((offer) => offer.status === "NOT_READY")
      .sort((first, second) =>
        first.missingData.length - second.missingData.length ||
        first.supplierName.localeCompare(second.supplierName),
      ),
    targetMarginPercent,
  };
}
