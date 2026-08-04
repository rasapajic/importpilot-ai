import {
  convertToEur,
  DEFAULT_EUR_FX_SNAPSHOT,
  type FxSnapshot,
} from "../../fx/euro-display";
import type { RecommendationStatusValue } from "./recommendation";

export const LUNA_COUNTRY_RANKING_VERSION = "LUNA_COUNTRY_RANKING_V1" as const;

export type LunaCountryRankingStatus =
  | "TOP_PICK"
  | "ALTERNATIVE"
  | "REVIEW_REQUIRED"
  | "INCOMPLETE";

export type LunaCountryRankingReason =
  | "COUNTRY_MATCH"
  | "COUNTRY_MISMATCH"
  | "CALCULATION_NEEDS_REVIEW"
  | "MISSING_CALCULATION"
  | "MISSING_ASSESSMENT"
  | "FX_UNAVAILABLE"
  | "LOWEST_LANDED_COST"
  | "COST_ABOVE_BEST"
  | "MARGIN_AT_OR_ABOVE_TARGET"
  | "MARGIN_BELOW_TARGET"
  | "LOW_SUPPLIER_RISK"
  | "MEDIUM_SUPPLIER_RISK"
  | "HIGH_SUPPLIER_RISK";

export type LunaCountryRankingOfferInput = {
  offerId: string;
  supplierName: string;
  currency: string | null;
  calculationTargetCountry: string | null;
  calculationStatus: "CALCULATED" | "NEEDS_REVIEW" | "DRAFT" | null;
  landedCostPerUnit: number | null;
  grossMarginPercent: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
  confidenceScore: number | null;
  deliveryTimeDays: number | null;
  recommendationStatus: RecommendationStatusValue | null;
};

export type LunaCountryRankedOffer = LunaCountryRankingOfferInput & {
  version: typeof LUNA_COUNTRY_RANKING_VERSION;
  targetCountry: string;
  targetMarginPercent: number;
  status: LunaCountryRankingStatus;
  rank: number | null;
  score: number | null;
  landedCostPerUnitEur: number | null;
  reasons: LunaCountryRankingReason[];
  metrics: {
    economicsScore: number | null;
    marginScore: number | null;
    costScore: number | null;
    supplierSafetyScore: number | null;
    assessmentScore: number | null;
    confidenceScore: number | null;
  };
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function rounded(value: number) {
  return Math.round(clamp(value));
}

function marginScore(margin: number, target: number) {
  if (margin < 0) return 0;
  if (target <= 0) return rounded(50 + margin);
  if (margin >= target) return rounded(70 + Math.min(30, (margin - target) * 2));
  return rounded(70 * (margin / target));
}

function riskReason(risk: number): LunaCountryRankingReason {
  if (risk <= 30) return "LOW_SUPPLIER_RISK";
  if (risk <= 55) return "MEDIUM_SUPPLIER_RISK";
  return "HIGH_SUPPLIER_RISK";
}

function incompleteResult(
  offer: LunaCountryRankingOfferInput,
  targetCountry: string,
  targetMarginPercent: number,
  reasons: LunaCountryRankingReason[],
  status: Extract<LunaCountryRankingStatus, "REVIEW_REQUIRED" | "INCOMPLETE">,
): LunaCountryRankedOffer {
  return {
    ...offer,
    version: LUNA_COUNTRY_RANKING_VERSION,
    targetCountry,
    targetMarginPercent,
    status,
    rank: null,
    score: null,
    landedCostPerUnitEur: null,
    reasons,
    metrics: {
      economicsScore: null,
      marginScore: null,
      costScore: null,
      supplierSafetyScore: null,
      assessmentScore: null,
      confidenceScore: null,
    },
  };
}

export function rankOffersForCountry(
  input: {
    targetCountry: string;
    targetMarginPercent: number;
    offers: LunaCountryRankingOfferInput[];
  },
  fx: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
): LunaCountryRankedOffer[] {
  const targetCountry = input.targetCountry.trim().toUpperCase();
  const preliminary: Array<
    | { kind: "eligible"; offer: LunaCountryRankingOfferInput; landedCostPerUnitEur: number }
    | { kind: "blocked"; result: LunaCountryRankedOffer }
  > = input.offers.map((offer) => {
    if (
      offer.calculationTargetCountry === null ||
      offer.calculationStatus === null ||
      offer.landedCostPerUnit === null ||
      offer.grossMarginPercent === null
    ) {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["MISSING_CALCULATION"],
          "INCOMPLETE",
        ),
      };
    }
    if (
      offer.supplierRiskScore === null ||
      offer.overallScore === null ||
      offer.confidenceScore === null ||
      offer.recommendationStatus === null
    ) {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["MISSING_ASSESSMENT"],
          "INCOMPLETE",
        ),
      };
    }
    if (offer.calculationTargetCountry.toUpperCase() !== targetCountry) {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["COUNTRY_MISMATCH"],
          "REVIEW_REQUIRED",
        ),
      };
    }
    if (offer.calculationStatus !== "CALCULATED") {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["COUNTRY_MATCH", "CALCULATION_NEEDS_REVIEW"],
          "REVIEW_REQUIRED",
        ),
      };
    }
    if (!offer.currency) {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["FX_UNAVAILABLE"],
          "INCOMPLETE",
        ),
      };
    }
    const landedCostPerUnitEur = convertToEur(offer.landedCostPerUnit, offer.currency, fx);
    if (landedCostPerUnitEur === null || landedCostPerUnitEur <= 0) {
      return {
        kind: "blocked",
        result: incompleteResult(
          offer,
          targetCountry,
          input.targetMarginPercent,
          ["FX_UNAVAILABLE"],
          "INCOMPLETE",
        ),
      };
    }
    return { kind: "eligible", offer, landedCostPerUnitEur };
  });

  const eligible = preliminary.filter(
    (item): item is Extract<(typeof preliminary)[number], { kind: "eligible" }> => item.kind === "eligible",
  );
  const lowestCost = eligible.length
    ? Math.min(...eligible.map((item) => item.landedCostPerUnitEur))
    : null;

  const ranked = eligible
    .map(({ offer, landedCostPerUnitEur }) => {
      const calculatedMarginScore = marginScore(
        offer.grossMarginPercent!,
        input.targetMarginPercent,
      );
      const costScore = lowestCost === null
        ? 0
        : rounded((lowestCost / landedCostPerUnitEur) * 100);
      const economicsScore = rounded(calculatedMarginScore * 0.6 + costScore * 0.4);
      const supplierSafetyScore = rounded(100 - offer.supplierRiskScore!);
      const assessmentScore = rounded(offer.overallScore!);
      const confidenceScore = rounded(offer.confidenceScore!);
      const score = rounded(
        economicsScore * 0.45 +
        supplierSafetyScore * 0.25 +
        assessmentScore * 0.2 +
        confidenceScore * 0.1,
      );
      const reasons: LunaCountryRankingReason[] = [
        "COUNTRY_MATCH",
        landedCostPerUnitEur === lowestCost ? "LOWEST_LANDED_COST" : "COST_ABOVE_BEST",
        offer.grossMarginPercent! >= input.targetMarginPercent
          ? "MARGIN_AT_OR_ABOVE_TARGET"
          : "MARGIN_BELOW_TARGET",
        riskReason(offer.supplierRiskScore!),
      ];
      return {
        ...offer,
        version: LUNA_COUNTRY_RANKING_VERSION,
        targetCountry,
        targetMarginPercent: input.targetMarginPercent,
        status: "ALTERNATIVE" as LunaCountryRankingStatus,
        rank: 0,
        score,
        landedCostPerUnitEur,
        reasons,
        metrics: {
          economicsScore,
          marginScore: calculatedMarginScore,
          costScore,
          supplierSafetyScore,
          assessmentScore,
          confidenceScore,
        },
      } satisfies LunaCountryRankedOffer;
    })
    .sort((a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      (a.landedCostPerUnitEur ?? Number.MAX_SAFE_INTEGER) -
        (b.landedCostPerUnitEur ?? Number.MAX_SAFE_INTEGER) ||
      (a.supplierRiskScore ?? Number.MAX_SAFE_INTEGER) -
        (b.supplierRiskScore ?? Number.MAX_SAFE_INTEGER) ||
      a.supplierName.localeCompare(b.supplierName),
    )
    .map((offer, index) => ({
      ...offer,
      rank: index + 1,
      status: index === 0 ? "TOP_PICK" as const : "ALTERNATIVE" as const,
    }));

  const blocked = preliminary
    .filter((item): item is Extract<(typeof preliminary)[number], { kind: "blocked" }> => item.kind === "blocked")
    .map((item) => item.result)
    .sort((a, b) =>
      a.status.localeCompare(b.status) || a.supplierName.localeCompare(b.supplierName),
    );

  return [...ranked, ...blocked];
}
