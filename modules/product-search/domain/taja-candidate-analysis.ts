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
import type { TajaPreliminaryCostEstimate } from "./taja-preliminary-cost-estimate";
import {
  evaluateTajaPriceSignal,
  TajaPriceSignalStatuses,
  tajaPriceSignalRank,
  type TajaPriceSignal,
} from "./taja-price-signal";
import {
  evaluateTajaRequirementMatch,
  TajaRequirementMatchStatuses,
  tajaRequirementMatchRank,
  type TajaRequirementMatch,
} from "./taja-requirement-match";

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
  | "CORE_OFFER_DATA"
  | "PRODUCT_REQUIREMENTS"
  | "PRICE_BASIS";

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
  preliminaryCostEstimate: TajaPreliminaryCostEstimate | null;
  requirementMatch: TajaRequirementMatch;
  priceSignal: TajaPriceSignal;
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
  productQuery?: string;
};

type CandidateWithEnrichment = {
  result: SupplierOfferSearchResult;
  enrichment?: TajaCandidateEnrichment;
  preliminaryCostEstimate?: TajaPreliminaryCostEstimate | null;
};

type InternalAnalysis = {
  result: SupplierOfferSearchResult;
  assessment: OfferAssessmentResult;
  status: TajaCandidateAnalysisStatus;
  finalEligible: boolean;
  landedCostStatus: TajaLandedCostStatus;
  preliminaryCostEstimate: TajaPreliminaryCostEstimate | null;
  requirementMatch: TajaRequirementMatch;
  priceSignal: TajaPriceSignal;
  overallScore: number;
  missingData: TajaMissingDataKey[];
  preliminaryIndex: number;
};

function samePrice(left: number | null | undefined, right: number | null) {
  return left !== null && left !== undefined && right !== null &&
    Math.abs(left - right) <= 0.0001;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * A stored landed cost is valid only for the same unit price, currency and
 * Incoterm that are currently shown by the supplier. Quantity and destination
 * must already be scoped by the caller. Changed commercial terms invalidate
 * the old calculation but preserve supplier-risk evidence.
 */
export function useMatchingTajaLandedCost(
  enrichment: TajaCandidateEnrichment | undefined,
  result: SupplierOfferSearchResult,
) {
  if (!enrichment) return undefined;
  if (
    enrichment.landedCostStatus === undefined ||
    enrichment.landedCostStatus === TajaLandedCostStatuses.UNAVAILABLE
  ) {
    return enrichment;
  }

  const matches = samePrice(enrichment.landedCostUnitPrice, result.price) &&
    enrichment.landedCostCurrency === result.currency &&
    enrichment.landedCostIncoterm === result.incoterm;
  if (matches) return enrichment;

  return {
    ...enrichment,
    landedCostPerUnit: null,
    grossMarginPercent: null,
    landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
    landedCostUnitPrice: null,
    landedCostCurrency: null,
    landedCostIncoterm: null,
  } satisfies TajaCandidateEnrichment;
}

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

function priceAllowsFinal(priceSignal: TajaPriceSignal) {
  return priceSignal.status === TajaPriceSignalStatuses.NORMAL ||
    priceSignal.status === TajaPriceSignalStatuses.UNAVAILABLE;
}

function missingData(
  candidate: CandidateWithEnrichment,
  assessment: OfferAssessmentResult,
  landedCostStatus: TajaLandedCostStatus,
  requirementMatch: TajaRequirementMatch,
  priceSignal: TajaPriceSignal,
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
  if (
    requirementMatch.status === TajaRequirementMatchStatuses.PARTIAL ||
    requirementMatch.status === TajaRequirementMatchStatuses.UNCONFIRMED
  ) {
    missing.push("PRODUCT_REQUIREMENTS");
  }
  if (!priceAllowsFinal(priceSignal)) missing.push("PRICE_BASIS");

  return missing;
}

function requirementsAllowFinal(requirementMatch: TajaRequirementMatch) {
  return requirementMatch.status === TajaRequirementMatchStatuses.FULL ||
    requirementMatch.status === TajaRequirementMatchStatuses.NOT_EVALUATED;
}

function finalEligibility(
  candidate: CandidateWithEnrichment,
  assessment: OfferAssessmentResult,
  landedCostStatus: TajaLandedCostStatus,
  requirementMatch: TajaRequirementMatch,
  priceSignal: TajaPriceSignal,
) {
  return coreOfferDataKnown(candidate.result) &&
    requirementsAllowFinal(requirementMatch) &&
    priceAllowsFinal(priceSignal) &&
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

function preliminaryOrder(
  candidates: CandidateWithEnrichment[],
  quantity: number,
  productQuery?: string,
) {
  const ordered = rankPreliminarySupplierOffers(
    candidates.map((candidate) => candidate.result),
    { quantity, productQuery },
  );
  return new Map(ordered.map((result, index) => [result.productUrl, index]));
}

function compactExplanation(
  assessment: OfferAssessmentResult,
  status: TajaCandidateAnalysisStatus,
  missing: TajaMissingDataKey[],
  estimate: TajaPreliminaryCostEstimate | null,
) {
  if (status === TajaCandidateAnalysisStatuses.FINAL) return assessment.explanation;
  const estimateText = estimate
    ? `Preliminarni ukupni trošak je ${estimate.lowPerUnitEur.toFixed(2)}–${estimate.highPerUnitEur.toFixed(2)} EUR po komadu; osnovni scenario je ${estimate.basePerUnitEur.toFixed(2)} EUR (${estimate.transportMode}, pouzdanost ${estimate.confidence}). `
    : "";
  const basisText = estimate?.pricingBasisAssumed
    ? `Za računicu je privremeno korišćen ${estimate.pricingBasisIncoterm} osnov jer ponuda nema izričit Incoterm. `
    : "";
  const chinaPlanningText = estimate && (
    estimate.chinaDomesticTransportEur > 0 || estimate.sourcingAgentFeeEur > 0
  )
    ? `U osnovni scenario uračunati su planski troškovi u Kini: domaći prevoz ${estimate.chinaDomesticTransportEur.toFixed(2)} EUR i agent/konsolidacija ${estimate.sourcingAgentFeeEur.toFixed(2)} EUR; to još nisu potvrđene ponude. `
    : "";
  const originText = estimate?.warnings.includes("SUPPLIER_ORIGIN_ASSUMED_CHINA")
    ? "Kinesko poreklo još nije potvrđeno i pretpostavljeno je samo na osnovu marketplace-a. "
    : "";
  return missing.length > 0
    ? `${estimateText}${basisText}${chinaPlanningText}${originText}Preporuka ostaje preliminarna dok se ne potvrde nedostajući podaci.`
    : `${estimateText}${basisText}${chinaPlanningText}${originText}Preporuka je preliminarna dok se ne završi detaljna provera finalista.`;
}

function rankingBucket(item: InternalAnalysis) {
  if (!item.finalEligible) return 3;
  if (item.assessment.recommendationStatus === RecommendationStatuses.RECOMMENDED) return 0;
  if (item.assessment.recommendationStatus === RecommendationStatuses.OK_WITH_RISK) return 1;
  if (item.assessment.recommendationStatus === RecommendationStatuses.NEEDS_NEGOTIATION) return 2;
  return 4;
}

function reliableEstimatedCost(item: InternalAnalysis) {
  return item.preliminaryCostEstimate?.confidence === "LOW"
    ? null
    : item.preliminaryCostEstimate?.basePerUnitEur ?? null;
}

/**
 * Reuses ImportPilot's landed-cost-aware offer scoring and supplier-risk V2.
 * A candidate may be sorted highly while still remaining PRELIMINARY. It is
 * marked FINAL only after confirmed landed cost, confirmed product requirements,
 * verified price basis and sufficient supplier-risk evidence are available.
 * Automatic cost ranges remain ESTIMATED and never unlock a final recommendation.
 */
export function analyzeAndRankTajaCandidates(
  candidates: CandidateWithEnrichment[],
  context: TajaCandidateAnalysisContext,
) {
  const normalizedCandidates = candidates.map((candidate) => ({
    ...candidate,
    enrichment: useMatchingTajaLandedCost(candidate.enrichment, candidate.result),
  }));
  const allResults = normalizedCandidates.map((candidate) => candidate.result);
  const preliminaryIndexes = preliminaryOrder(
    normalizedCandidates,
    context.quantity,
    context.productQuery,
  );
  const analyzed: InternalAnalysis[] = normalizedCandidates.map((candidate) => {
    const persistedLandedCostStatus = candidate.enrichment?.landedCostStatus ??
      TajaLandedCostStatuses.UNAVAILABLE;
    const preliminaryCostEstimate = candidate.preliminaryCostEstimate ?? null;
    const landedCostStatus =
      persistedLandedCostStatus === TajaLandedCostStatuses.UNAVAILABLE && preliminaryCostEstimate
        ? TajaLandedCostStatuses.ESTIMATED
        : persistedLandedCostStatus;
    const requirementMatch = evaluateTajaRequirementMatch(
      context.productQuery ?? "",
      candidate.result,
    );
    const priceSignal = evaluateTajaPriceSignal(candidate.result, allResults);
    const assessment = assessOffer(
      assessmentInput(candidate, context),
      comparisonForCandidate(candidate.result, normalizedCandidates),
    );
    const overallScore = clampScore(
      assessment.overallScore +
      requirementMatch.scoreAdjustment +
      priceSignal.scoreAdjustment,
    );
    const finalEligible = finalEligibility(
      candidate,
      assessment,
      landedCostStatus,
      requirementMatch,
      priceSignal,
    );
    return {
      result: candidate.result,
      assessment,
      finalEligible,
      status: finalEligible
        ? TajaCandidateAnalysisStatuses.FINAL
        : TajaCandidateAnalysisStatuses.PRELIMINARY,
      landedCostStatus,
      preliminaryCostEstimate,
      requirementMatch,
      priceSignal,
      overallScore,
      missingData: missingData(
        candidate,
        assessment,
        landedCostStatus,
        requirementMatch,
        priceSignal,
      ),
      preliminaryIndex: preliminaryIndexes.get(candidate.result.productUrl) ?? Number.MAX_SAFE_INTEGER,
    };
  });

  analyzed.sort((left, right) => {
    const bucketDifference = rankingBucket(left) - rankingBucket(right);
    if (bucketDifference !== 0) return bucketDifference;
    if (left.finalEligible && right.finalEligible) {
      return right.overallScore - left.overallScore ||
        right.assessment.confidenceScore - left.assessment.confidenceScore ||
        left.assessment.supplierRiskScore - right.assessment.supplierRiskScore ||
        left.preliminaryIndex - right.preliminaryIndex;
    }
    if (!left.finalEligible && !right.finalEligible) {
      const requirementRankDifference =
        tajaRequirementMatchRank(left.requirementMatch.status) -
        tajaRequirementMatchRank(right.requirementMatch.status);
      if (requirementRankDifference !== 0) return requirementRankDifference;
      const priceSignalDifference =
        tajaPriceSignalRank(left.priceSignal.status) -
        tajaPriceSignalRank(right.priceSignal.status);
      if (priceSignalDifference !== 0) return priceSignalDifference;
      if (
        left.requirementMatch.scoreAdjustment !== right.requirementMatch.scoreAdjustment
      ) {
        return right.requirementMatch.scoreAdjustment - left.requirementMatch.scoreAdjustment;
      }
      const leftEstimate = reliableEstimatedCost(left);
      const rightEstimate = reliableEstimatedCost(right);
      if (leftEstimate !== null && rightEstimate !== null && leftEstimate !== rightEstimate) {
        return leftEstimate - rightEstimate;
      }
      if (leftEstimate !== null && rightEstimate === null) return -1;
      if (leftEstimate === null && rightEstimate !== null) return 1;
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
      preliminaryCostEstimate: item.preliminaryCostEstimate,
      requirementMatch: item.requirementMatch,
      priceSignal: item.priceSignal,
      overallScore: item.overallScore,
      confidenceScore: item.assessment.confidenceScore,
      supplierRiskScore: item.assessment.supplierRiskScore,
      supplierRiskLevel: item.assessment.scoreBreakdown.supplierRiskV2.riskLevel,
      recommendationStatus: item.assessment.recommendationStatus,
      missingData: item.missingData,
      explanation: compactExplanation(
        item.assessment,
        item.status,
        item.missingData,
        item.preliminaryCostEstimate,
      ),
    })),
  };
}
