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
 * marketplace tracking parameters changed between searches. Prefer the record
 * with the strongest landed-cost and supplier evidence. When evidence is tied,
 * keep the current value; callers can order records newest-first for a stable
 * recency tie-breaker.
 */
export function selectPreferredTajaCandidateEnrichment(
  current: TajaCandidateEnrichment | undefined,
  candidate: TajaCandidateEnrichment,
) {
  if (!current) return candidate;
  return tajaCandidateEnrichmentEvidenceScore(candidate) >
      tajaCandidateEnrichmentEvidenceScore(current)
    ? candidate
    : current;
}
