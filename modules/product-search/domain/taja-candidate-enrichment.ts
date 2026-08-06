import {
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "./taja-candidate-analysis";

const EVIDENCE_FIELDS = [
  "supplierVerified",
  "yearsOnPlatform",
  "responseRatePercent",
  "transactionCount",
  "employeeCount",
  "profileCompletenessScore",
  "deliveryTimeDays",
  "sampleAvailable",
  "termsClarityScore",
  "shippingClarityScore",
  "landedCostPerUnit",
  "grossMarginPercent",
] as const satisfies readonly (keyof TajaCandidateEnrichment)[];

function landedCostEvidenceWeight(enrichment: TajaCandidateEnrichment) {
  if (enrichment.landedCostStatus === TajaLandedCostStatuses.CONFIRMED) return 1_000;
  if (enrichment.landedCostStatus === TajaLandedCostStatuses.ESTIMATED) return 500;
  return 0;
}

export function tajaCandidateEnrichmentEvidenceScore(
  enrichment: TajaCandidateEnrichment,
) {
  return landedCostEvidenceWeight(enrichment) + EVIDENCE_FIELDS.reduce(
    (knownCount, field) =>
      enrichment[field] !== null && enrichment[field] !== undefined
        ? knownCount + 1
        : knownCount,
    0,
  );
}

/**
 * Legacy projects may contain the same supplier page more than once because
 * marketplace tracking parameters changed between searches. Records are read
 * newest-first. Keep the newest known supplier value, fill its gaps from older
 * copies and retain the strongest landed-cost calculation.
 */
export function mergeTajaCandidateEnrichment(
  current: TajaCandidateEnrichment | undefined,
  candidate: TajaCandidateEnrichment,
): TajaCandidateEnrichment {
  if (!current) return candidate;
  const preferredCost = landedCostEvidenceWeight(candidate) >
      landedCostEvidenceWeight(current)
    ? candidate
    : current;

  return {
    supplierVerified: current.supplierVerified ?? candidate.supplierVerified ?? null,
    yearsOnPlatform: current.yearsOnPlatform ?? candidate.yearsOnPlatform ?? null,
    responseRatePercent: current.responseRatePercent ?? candidate.responseRatePercent ?? null,
    transactionCount: current.transactionCount ?? candidate.transactionCount ?? null,
    employeeCount: current.employeeCount ?? candidate.employeeCount ?? null,
    profileCompletenessScore: current.profileCompletenessScore ??
      candidate.profileCompletenessScore ?? null,
    deliveryTimeDays: current.deliveryTimeDays ?? candidate.deliveryTimeDays ?? null,
    sampleAvailable: current.sampleAvailable ?? candidate.sampleAvailable ?? null,
    termsClarityScore: current.termsClarityScore ?? candidate.termsClarityScore ?? null,
    shippingClarityScore: current.shippingClarityScore ??
      candidate.shippingClarityScore ?? null,
    landedCostPerUnit: preferredCost.landedCostPerUnit ?? null,
    grossMarginPercent: preferredCost.grossMarginPercent ?? null,
    landedCostStatus: preferredCost.landedCostStatus ??
      TajaLandedCostStatuses.UNAVAILABLE,
    landedCostUnitPrice: preferredCost.landedCostUnitPrice ?? null,
    landedCostCurrency: preferredCost.landedCostCurrency ?? null,
    landedCostIncoterm: preferredCost.landedCostIncoterm ?? null,
  };
}
