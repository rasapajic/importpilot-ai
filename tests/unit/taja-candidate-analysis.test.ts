import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
  TajaCandidateAnalysisStatuses,
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(
  name: string,
  price: number | null,
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title: `${name} product`,
    supplierName: `${name} supplier`,
    supplierCountry: "CN",
    price,
    currency: price === null ? null : "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: `https://supplier.example.com/${name.toLowerCase()}`,
    imageUrl: null,
    source: "TAJA web",
    ...overrides,
  };
}

function confirmedEnrichment(
  overrides: Partial<TajaCandidateEnrichment> = {},
): TajaCandidateEnrichment {
  return {
    supplierVerified: true,
    yearsOnPlatform: 5,
    responseRatePercent: 92,
    transactionCount: 120,
    employeeCount: 80,
    profileCompletenessScore: 90,
    deliveryTimeDays: 20,
    sampleAvailable: true,
    termsClarityScore: 90,
    shippingClarityScore: 90,
    landedCostPerUnit: 8,
    grossMarginPercent: 40,
    landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
    ...overrides,
  };
}

const context = { quantity: 100, targetMarginPercent: 30 };

describe("TAJA candidate final-ranking gate", () => {
  it("keeps search-only candidates preliminary and explains missing evidence", () => {
    const analyzed = analyzeAndRankTajaCandidates([
      { result: result("Basic", 5) },
    ], context);

    expect(analyzed.rankedResults).toHaveLength(1);
    expect(analyzed.analyses[0]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      finalEligible: false,
      landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
      missingData: expect.arrayContaining([
        "LANDED_COST",
        "SUPPLIER_VERIFICATION",
        "SUPPLIER_RISK_DATA",
      ]),
    });
  });

  it("marks a candidate final only with confirmed landed cost and sufficient risk data", () => {
    const candidate = result("Verified", 6);
    const analyzed = analyzeAndRankTajaCandidates([
      { result: candidate, enrichment: confirmedEnrichment() },
    ], context);

    expect(analyzed.analyses[0]).toMatchObject({
      productUrl: candidate.productUrl,
      rank: 1,
      status: TajaCandidateAnalysisStatuses.FINAL,
      finalEligible: true,
      landedCostStatus: TajaLandedCostStatuses.CONFIRMED,
    });
    expect(analyzed.analyses[0]?.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(analyzed.analyses[0]?.supplierRiskLevel).not.toBe("UNKNOWN");
  });

  it("does not treat an estimated landed cost as a final recommendation", () => {
    const candidate = result("Estimated", 6);
    const analyzed = analyzeAndRankTajaCandidates([
      {
        result: candidate,
        enrichment: confirmedEnrichment({
          landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
        }),
      },
    ], context);

    expect(analyzed.analyses[0]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      finalEligible: false,
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      missingData: expect.arrayContaining(["LANDED_COST"]),
    });
  });

  it("places final analyses before preliminary candidates while retaining all offers", () => {
    const cheapButUnknown = result("Cheap", 3);
    const verified = result("Verified", 6);
    const other = result("Other", 7);
    const analyzed = analyzeAndRankTajaCandidates([
      { result: cheapButUnknown },
      { result: verified, enrichment: confirmedEnrichment() },
      { result: other },
    ], context);

    expect(analyzed.rankedResults.map((candidate) => candidate.productUrl)).toEqual([
      verified.productUrl,
      cheapButUnknown.productUrl,
      other.productUrl,
    ]);
    expect(analyzed.analyses.map((analysis) => analysis.rank)).toEqual([1, 2, 3]);
    expect(analyzed.analyses.map((analysis) => analysis.status)).toEqual([
      TajaCandidateAnalysisStatuses.FINAL,
      TajaCandidateAnalysisStatuses.PRELIMINARY,
      TajaCandidateAnalysisStatuses.PRELIMINARY,
    ]);
  });

  it("can finish a high-risk analysis without presenting it as a safe offer", () => {
    const risky = result("Risky", 1);
    const analyzed = analyzeAndRankTajaCandidates([
      {
        result: risky,
        enrichment: confirmedEnrichment({
          supplierVerified: false,
          yearsOnPlatform: 0,
          responseRatePercent: 20,
          transactionCount: 0,
          profileCompletenessScore: 20,
          sampleAvailable: false,
          termsClarityScore: 20,
          shippingClarityScore: 20,
          grossMarginPercent: -5,
        }),
      },
    ], context);

    expect(analyzed.analyses[0]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.FINAL,
      finalEligible: true,
      supplierRiskLevel: "HIGH",
      recommendationStatus: "NOT_RECOMMENDED",
    });
  });
});
