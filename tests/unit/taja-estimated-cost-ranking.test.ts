import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
  TajaCandidateAnalysisStatuses,
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";
import type { TajaPreliminaryCostEstimate } from "../../modules/product-search/domain/taja-preliminary-cost-estimate";

function result(name: string, price: number): SupplierOfferSearchResult {
  return {
    title: `${name} phone charger`,
    supplierName: `${name} supplier`,
    supplierCountry: "CN",
    price,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: `https://supplier.example/${name.toLowerCase()}`,
    imageUrl: null,
    source: "TAJA web",
  };
}

function estimate(basePerUnitEur: number): TajaPreliminaryCostEstimate {
  return {
    version: "TAJA_PRELIMINARY_LANDED_COST_V3",
    currency: "EUR",
    lowPerUnitEur: basePerUnitEur - 0.5,
    basePerUnitEur,
    highPerUnitEur: basePerUnitEur + 0.5,
    requiredSellingPriceBaseEur: basePerUnitEur * 1.5,
    goodsCostEur: 500,
    transportMode: "RAIL",
    transportCostEur: 100,
    chinaDomesticTransportEur: 0,
    sourcingAgentFeeEur: 0,
    deliveryTimeDays: "20-30",
    confidence: "MEDIUM",
    pricingBasisIncoterm: "FOB",
    pricingBasisAssumed: false,
    vatRatePercent: 20,
    customsDutyRateScenarios: [0, 5, 10],
    fxSource: "test",
    fxTimestamp: "2026-01-01T00:00:00.000Z",
    assumptions: [],
    warnings: ["CUSTOMS_CLASSIFICATION_REQUIRED"],
  };
}

function supplierEvidence(): TajaCandidateEnrichment {
  return {
    supplierVerified: true,
    yearsOnPlatform: 5,
    responseRatePercent: 90,
    transactionCount: 100,
    employeeCount: 50,
    profileCompletenessScore: 90,
    deliveryTimeDays: 25,
    sampleAvailable: true,
    termsClarityScore: 90,
    shippingClarityScore: 90,
  };
}

const context = { quantity: 100, targetMarginPercent: 30 };

describe("TAJA estimated-cost ranking", () => {
  it("shows an automatic range as ESTIMATED but never unlocks FINAL", () => {
    const candidate = result("Estimated", 6);
    const analyzed = analyzeAndRankTajaCandidates([
      {
        result: candidate,
        enrichment: supplierEvidence(),
        preliminaryCostEstimate: estimate(9),
      },
    ], context);

    expect(analyzed.analyses[0]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      finalEligible: false,
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      preliminaryCostEstimate: expect.objectContaining({ basePerUnitEur: 9 }),
      missingData: expect.arrayContaining(["LANDED_COST"]),
    });
    expect(analyzed.analyses[0]?.explanation).toContain("9.00 EUR");
  });

  it("uses medium-confidence cost estimates before unestimated preliminary ties", () => {
    const unestimated = result("Unestimated", 4);
    const estimated = result("Estimated", 6);
    const analyzed = analyzeAndRankTajaCandidates([
      { result: unestimated },
      { result: estimated, preliminaryCostEstimate: estimate(8) },
    ], context);

    expect(analyzed.rankedResults.map((candidate) => candidate.productUrl)).toEqual([
      estimated.productUrl,
      unestimated.productUrl,
    ]);
  });

  it("discloses assumed 1688 EXW, China origin and domestic planning costs", () => {
    const candidate = {
      ...result("1688", 3),
      supplierCountry: null,
      incoterm: null,
      productUrl: "https://detail.1688.com/offer/123456789.html",
    };
    const assumedEstimate: TajaPreliminaryCostEstimate = {
      ...estimate(6),
      chinaDomesticTransportEur: 30,
      sourcingAgentFeeEur: 35,
      pricingBasisIncoterm: "EXW",
      pricingBasisAssumed: true,
      warnings: [
        "CUSTOMS_CLASSIFICATION_REQUIRED",
        "SUPPLIER_ORIGIN_ASSUMED_CHINA",
        "INCOTERM_ASSUMED_EXW_FOR_1688",
        "CHINA_DOMESTIC_TRANSPORT_ASSUMED",
        "SOURCING_AGENT_FEE_ASSUMED",
      ],
    };
    const analyzed = analyzeAndRankTajaCandidates([
      { result: candidate, preliminaryCostEstimate: assumedEstimate },
    ], context);

    expect(analyzed.analyses[0]?.explanation).toContain("privremeno korišćen EXW");
    expect(analyzed.analyses[0]?.explanation).toContain("domaći prevoz 30.00 EUR");
    expect(analyzed.analyses[0]?.explanation).toContain("agent/konsolidacija 35.00 EUR");
    expect(analyzed.analyses[0]?.explanation).toContain("Kinesko poreklo još nije potvrđeno");
    expect(analyzed.analyses[0]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      finalEligible: false,
    });
  });

  it("does not let a low-confidence fallback estimate override preliminary ordering", () => {
    const first = result("First", 4);
    const second = result("Second", 6);
    const lowConfidence = { ...estimate(1), confidence: "LOW" as const };
    const analyzed = analyzeAndRankTajaCandidates([
      { result: first },
      { result: second, preliminaryCostEstimate: lowConfidence },
    ], context);

    expect(analyzed.rankedResults[0]?.productUrl).toBe(first.productUrl);
  });
});
