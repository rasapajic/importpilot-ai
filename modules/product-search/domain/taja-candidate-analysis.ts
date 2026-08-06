import {
  assessOffer,
  type AssessmentOfferInput,
  type OfferAssessmentResult,
  type PriceComparison,
} from "../../intelligence/domain/scoring";
import { RecommendationStatuses } from "../../intelligence/domain/recommendation";
import { SupplierRiskLevels } from "../../intelligence/domain/supplier-risk-v2";
import { rankPreliminarySupplierOffers } from "./preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "./search";

export const TajaCandidateAnalysisStatuses = {
  PRELIMINARY: "PRELIMINARY",
  FINAL: "FINAL",
} as const;

export type TajaCandidateAnalysisStatus =
  (typeof TajaCandidateAnalysisStatuses)[keyof typeof TajaCandidateAnalysisStatuses];

export const TajaLandedCostStatuses = {
  UNAVAILABLE: "UNAVAILABLE",
  ESTIMATED: "ESTIMATED",
  CONFIRMED: "CONFIRMED",
} as const;

export type TajaLandedCostStatus =
  (typeof TajaLandedCostStatuses)[keyof typeof TajaLandedCostStatuses];

export type TajaMissingDataKey =
  | "LANDED_COST"
  | "SUPPLIER_VERIFICATION"
  | "SUPPLIER_RISK_DATA"
  | "DELIVERY_TIME"
  | "SAMPLE_AVAILABILITY"
  | "COMMERCIAL_TERMS"
  | "TRANSPORT_DETAILS"
  | "CORE_OFFER_DATA";

export type TajaCandidateEnrichment = {
  supplierVerified?: boolean | null;
  yearsOnPlatform?: number | null;
  responseRatePercent?: number | null;
  transactionCount?: number | null;
  employeeCount?: number | null;
  profileCompletenessScore?: number | null;
  deliveryTimeDays?: number | null;
  sampleAvailable?: boolean | null;
  termsClarityScore?: number | null;
  shippingClarityScore?: number | null;
  landedCostPerUnit?: number | null;
  grossMarginPercent?: number | null;
  landedCostStatus?: TajaLandedCostStatus;
  landedCostUnitPrice?: number | null;
  landedCostCurrency?: string | null;
  landedCostIncoterm?: string | null;
};

export type TajaCandidateAnalysis = {
  productUrl: string;
  rank: number;
  status: TajaCandidateAnalysisStatus;
  finalEligible: boolean;
  landedCostStatus: TajaLandedCostStatus;
  overallScore: number;
  confidenceScore: number;
  supplierRiskScore: number;
  supplierRiskLevel: OfferAssessmentResult["scoreBreakdown"]["supplierRiskV2"]["riskLevel"];
  recommendationStatus: OfferAssessmentResult["recommendationStatus"];
  missingData: TajaMissingDataKey[];
  explanation: string;
};

export type TajaCandidateAnalysisContext = {
  quantity: number;
  targetMarginPercent: number;
};

type CandidateWithEnrichment = {
  result: SupplierOfferSearchResult;
  enrichment?: TajaCandidateEnrichment;
};

type InternalAnalysis = {
  result: SupplierOfferSearchResult;
  assessment: OfferAssessmentResult;
  status: TajaCandidateAnalysisStatus;
  finalEligible: boolean;
  landedCostStatus: TajaLandedCostStatus;
  missingData: TajaMissingDataKey[];
  preliminaryIndex: number;
};

function comparisonForCandidate(
  result: SupplierOfferSearchResult,
  candidates: CandidateWithEnrichment[],
): PriceComparison | undefined {
  if (!result.currency) return undefined;
  return {
    currency: result.currency,
    unitPrices: candidates.flatMap((candidate) =>
      candidate.result.currency === result.currency && candidate.result.price !== null
        ? [candidate.result.price]
        : [],
    ),
  };
}

function assessmentInput(
  candidate: CandidateWithEnrichment,
  context: TajaCandidateAnalysisContext,
): AssessmentOfferInput {
  const { result, enrichment = {} } = candidate;
  return {
    offerId: result.productUrl,
    supplierName: result.supplierName,
    supplierCountry: result.supplierCountry,
    supplierVerified: enrichment.supplierVerified ?? null,
    yearsOnPlatform: enrichment.yearsOnPlatform ?? null,
    responseRatePercent: enrichment.responseRatePercent ?? null,
    transactionCount: enrichment.transactionCount ?? null,
    employeeCount: enrichment.employeeCount ?? null,
    profileCompletenessScore: enrichment.profileCompletenessScore ?? null,
    moq: result.minimumOrderQuantity,
    unitPrice: result.price,
    currency: result.currency,
    incoterm: result.incoterm,
    deliveryTimeDays: enrichment.deliveryTimeDays ?? null,
    sampleAvailable: enrichment.sampleAvailable ?? null,
    termsClarityScore: enrichment.termsClarityScore ?? null,
    shippingClarityScore: enrichment.shippingClarityScore ?? null,
    projectQuantity: context.quantity,
    projectTargetMargin: context.targetMarginPercent,
    landedCostPerUnit: enrichment.landedCostPerUnit ?? null,
    grossMarginPercent: enrichment.grossMarginPercent ?? null,
  };
}

function coreOfferDataKnown(result: SupplierOfferSearchResult) {
  return result.price !== null &&
    result.currency !== null &&
    result.minimumOrderQuantity !== null &&
    result.incoterm !== null &&
    result.supplierCountry !== null;
}

function missingData(
  candidate: CandidateWithEnrichment,
  assessment: OfferAssessmentResult,
  landedCostStatus: TajaLandedCostStatus,
): TajaMissingDataKey[] {
  const { result, enrichment = {} } = candidate;
  const missing: TajaMissingDataKey[] = [];

  if (!coreOfferDataKnown(result)) missing.push("CORE_OFFER_DATA");
  if (
    landedCostStatus !== TajaLandedCostStatuses.CONFIRMED ||
    enrichment.landedCostPerUnit === null ||
    enrichment.landedCostPerUnit === undefined ||
    enrichment.grossMarginPercent === null ||
    enrichment.grossMarginPercent === undefined
  ) {
    missing.push("LANDED_COST");
  }
  if (enrichment.supplierVerified === null || enrichment.supplierVerified === undefined) {
    missing.push("SUPPLIER_VERIFICATION");
  }
  if (
    assessment.scoreBreakdown.supplierRiskV2.riskLevel === SupplierRiskLevels.UNKNOWN
  ) {
    missing.push("SUPPLIER_RISK_DATA");
  }
  if (enrichment.deliveryTimeDays === null || enrichment.deliveryTimeDays === undefined) {
    missing.push("DELIVERY_TIME");
  }
  if (enrichment.sampleAvailable === null || enrichment.sampleAvailable === undefined) {
    missing.push("SAMPLE_AVAILABILITY");
  }
  if (enrichment.termsClarityScore === null || enrichment.termsClarityScore === undefined) {
    missing.push("COMMERCIAL_TERMS");
  }
  if (enrichment.shippingClarityScore === null || enrichment.shippingClarityScore === undefined) {
    missing.push("TRANSPORT_DETAILS");
  }

  return missing;
}

function finalEligibility(
  candidate: CandidateWithEnrichment,
  assessment: OfferAssessmentResult,
  landedCostStatus: TajaLandedCostStatus,
) {
  return coreOfferDataKnown(candidate.result) &&
    landedCostStatus === TajaLandedCostStatuses.CONFIRMED &&
    candidate.enrichment?.supplierVerified !== null &&
    candidate.enrichment?.supplierVerified !== undefined &&
    candidate.enrichment?.landedCostPerUnit !== null &&
    candidate.enrichment?.landedCostPerUnit !== undefined &&
    candidate.enrichment?.grossMarginPercent !== null &&
    candidate.enrichment?.grossMarginPercent !== undefined &&
    assessment.scoreBreakdown.supplierRiskV2.riskLevel !== SupplierRiskLevels.UNKNOWN &&
    assessment.confidenceScore >= 60;
}

function preliminaryOrder(candidates: CandidateWithEnrichment[], quantity: number) {
  const ordered = rankPreliminarySupplierOffers(
    candidates.map((candidate) => candidate.result),
    { quantity },
  );
  return new Map(ordered.map((result, index) => [result.productUrl, index]));
}

function compactExplanation(
  assessment: OfferAssessmentResult,
  status: TajaCandidateAnalysisStatus,
  missing: TajaMissingDataKey[],
) {
  if (status === TajaCandidateAnalysisStatuses.FINAL) return assessment.explanation;
  return missing.length > 0
    ? `Preporuka je preliminarna jer nedostaju potvrđeni podaci: ${missing.join(", ")}.`
    : "Preporuka je preliminarna dok se ne završi detaljna provera finalista.";
}

function rankingBucket(item: InternalAnalysis) {
  if (!item.finalEligible) return 3;
  if (item.assessment.recommendationStatus === RecommendationStatuses.RECOMMENDED) return 0;
  if (item.assessment.recommendationStatus === RecommendationStatuses.OK_WITH_RISK) return 1;
  if (item.assessment.recommendationStatus === RecommendationStatuses.NEEDS_NEGOTIATION) return 2;
  return 4;
}

/**
 * Reuses ImportPilot's landed-cost-aware offer scoring and supplier-risk V2.
 * A candidate may be sorted highly while still remaining PRELIMINARY. It is
 * marked FINAL only after confirmed landed cost and sufficient supplier-risk
 * evidence are available. A completed but rejected analysis remains FINAL,
 * but ranks below viable preliminary candidates instead of appearing as a top
 * recommendation.
 */
export function analyzeAndRankTajaCandidates(
  candidates: CandidateWithEnrichment[],
  context: TajaCandidateAnalysisContext,
) {
  const preliminaryIndexes = preliminaryOrder(candidates, context.quantity);
  const analyzed: InternalAnalysis[] = candidates.map((candidate) => {
    const landedCostStatus = candidate.enrichment?.landedCostStatus ??
      TajaLandedCostStatuses.UNAVAILABLE;
    const assessment = assessOffer(
      assessmentInput(candidate, context),
      comparisonForCandidate(candidate.result, candidates),
    );
    const finalEligible = finalEligibility(candidate, assessment, landedCostStatus);
    return {
      result: candidate.result,
      assessment,
      finalEligible,
      status: finalEligible
        ? TajaCandidateAnalysisStatuses.FINAL
        : TajaCandidateAnalysisStatuses.PRELIMINARY,
      landedCostStatus,
      missingData: missingData(candidate, assessment, landedCostStatus),
      preliminaryIndex: preliminaryIndexes.get(candidate.result.productUrl) ?? Number.MAX_SAFE_INTEGER,
    };
  });

  analyzed.sort((left, right) => {
    const bucketDifference = rankingBucket(left) - rankingBucket(right);
    if (bucketDifference !== 0) return bucketDifference;
    if (left.finalEligible && right.finalEligible) {
      return right.assessment.overallScore - left.assessment.overallScore ||
        right.assessment.confidenceScore - left.assessment.confidenceScore ||
        left.assessment.supplierRiskScore - right.assessment.supplierRiskScore ||
        left.preliminaryIndex - right.preliminaryIndex;
    }
    return left.preliminaryIndex - right.preliminaryIndex;
  });

  return {
    rankedResults: analyzed.map((item) => item.result),
    analyses: analyzed.map((item, index): TajaCandidateAnalysis => ({
      productUrl: item.result.productUrl,
      rank: index + 1,
      status: item.status,
      finalEligible: item.finalEligible,
      landedCostStatus: item.landedCostStatus,
      overallScore: item.assessment.overallScore,
      confidenceScore: item.assessment.confidenceScore,
      supplierRiskScore: item.assessment.supplierRiskScore,
      supplierRiskLevel: item.assessment.scoreBreakdown.supplierRiskV2.riskLevel,
      recommendationStatus: item.assessment.recommendationStatus,
      missingData: item.missingData,
      explanation: compactExplanation(item.assessment, item.status, item.missingData),
    })),
  };
}
