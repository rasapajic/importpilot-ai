import { describe, expect, it } from "vitest";

import {
  selectPreferredTajaCandidateEnrichment,
  tajaCandidateEnrichmentEvidenceScore,
} from "../../modules/product-search/domain/taja-candidate-enrichment";
import {
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "../../modules/product-search/domain/taja-candidate-analysis";

function enrichment(
  overrides: Partial<TajaCandidateEnrichment> = {},
): TajaCandidateEnrichment {
  return {
    supplierVerified: null,
    yearsOnPlatform: null,
    responseRatePercent: null,
    transactionCount: null,
    employeeCount: null,
    profileCompletenessScore: null,
    deliveryTimeDays: null,
    sampleAvailable: null,
    termsClarityScore: null,
    shippingClarityScore: null,
    landedCostPerUnit: null,
    grossMarginPercent: null,
    landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
    ...overrides,
  };
}

describe("TAJA candidate enrichment preference", () => {
  it("prefers confirmed landed-cost evidence over a richer unconfirmed record", () => {
    const unconfirmed = enrichment({
      supplierVerified: true,
      yearsOnPlatform: 5,
      responseRatePercent: 95,
      transactionCount: 100,
      profileCompletenessScore: 90,
    });
    const confirmed = enrichment({
      landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
      landedCostPerUnit: 12,
      grossMarginPercent: 35,
    });

    expect(selectPreferredTajaCandidateEnrichment(unconfirmed, confirmed)).toBe(confirmed);
  });

  it("prefers estimated landed cost over an otherwise richer unavailable record", () => {
    const unavailable = enrichment({
      supplierVerified: true,
      yearsOnPlatform: 5,
      responseRatePercent: 95,
      transactionCount: 100,
    });
    const estimated = enrichment({
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      landedCostPerUnit: 14,
      grossMarginPercent: 28,
    });

    expect(selectPreferredTajaCandidateEnrichment(unavailable, estimated)).toBe(estimated);
  });

  it("prefers the more complete record when landed-cost status is equal", () => {
    const sparse = enrichment({ supplierVerified: true });
    const complete = enrichment({
      supplierVerified: true,
      yearsOnPlatform: 4,
      responseRatePercent: 90,
      transactionCount: 80,
    });

    expect(tajaCandidateEnrichmentEvidenceScore(complete))
      .toBeGreaterThan(tajaCandidateEnrichmentEvidenceScore(sparse));
    expect(selectPreferredTajaCandidateEnrichment(sparse, complete)).toBe(complete);
  });

  it("keeps the current record when evidence strength is tied", () => {
    const current = enrichment({ supplierVerified: true });
    const candidate = enrichment({ supplierVerified: false });

    expect(selectPreferredTajaCandidateEnrichment(current, candidate)).toBe(current);
  });
});
