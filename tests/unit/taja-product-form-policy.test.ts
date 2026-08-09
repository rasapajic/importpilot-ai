import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
  TajaLandedCostStatuses,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import { TajaPriceSignalStatuses } from "../../modules/product-search/domain/taja-price-signal";
import {
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
} from "../../modules/product-search/domain/taja-product-form";
import { applyTajaProductFormPolicy } from "../../modules/product-search/domain/taja-product-form-policy";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";
import type { TajaPreliminaryCostEstimate } from "../../modules/product-search/domain/taja-preliminary-cost-estimate";

const productQuery = "Vodena magla za terasu sa pumpom i 20 mlaznica";

function result(
  slug: string,
  title: string,
  price: number,
): SupplierOfferSearchResult {
  return {
    title,
    supplierName: "Example supplier",
    supplierCountry: "CN",
    price,
    currency: "USD",
    minimumOrderQuantity: 10,
    incoterm: "FOB",
    productUrl: `https://supplier.example/${slug}`,
    imageUrl: null,
    source: "TAJA test",
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

describe("TAJA product-form policy", () => {
  it("keeps complete systems above explicit nozzle-only offers and isolates price groups", () => {
    const results = [
      result("system-10", "Patio Misting System Kit with Pump and 20 Nozzles", 10),
      result("system-12", "Terrace Misting System with Pump and 20 Nozzles", 12),
      result("system-15", "Patio Water Misting System with Pump and 20 Nozzles", 15),
      result("nozzles", "20 Brass Misting Nozzles Pack", 0.65),
    ];
    const base = analyzeAndRankTajaCandidates(
      results.map((candidate) => ({ result: candidate })),
      { quantity: 100, targetMarginPercent: 30, productQuery },
    );
    const applied = applyTajaProductFormPolicy({
      rankedResults: base.rankedResults,
      analyses: base.analyses,
      productQuery,
    });

    expect(applied.rankedResults.at(-1)?.productUrl).toContain("/nozzles");
    const component = applied.analyses.find((analysis) =>
      analysis.productUrl.includes("/nozzles"),
    );
    expect(component).toMatchObject({
      finalEligible: false,
      landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
      preliminaryCostEstimate: null,
      productForm: {
        form: TajaOfferProductForms.NOZZLES_ONLY,
        matchStatus: TajaProductFormMatchStatuses.MISMATCH,
      },
      priceSignal: { status: TajaPriceSignalStatuses.UNAVAILABLE },
    });
    expect(component?.missingData).not.toContain("PRICE_BASIS");

    const completeSystems = applied.analyses.filter((analysis) =>
      analysis.productForm.form === TajaOfferProductForms.COMPLETE_SYSTEM,
    );
    expect(completeSystems).toHaveLength(3);
    expect(completeSystems.every((analysis) =>
      analysis.priceSignal.status === TajaPriceSignalStatuses.NORMAL
    )).toBe(true);
    expect(completeSystems.every((analysis) =>
      !analysis.missingData.includes("PRICE_BASIS")
    )).toBe(true);
    expect(applied.analyses.every((analysis) =>
      analysis.status === "PRELIMINARY"
    )).toBe(true);
  });

  it("blocks landed cost for a contradictory system/nozzle listing until the sold unit is verified", () => {
    const ambiguous = result(
      "ambiguous-system-nozzles",
      "Misting System Mist Nozzles Outdoor Nozzles for Outdoor Pool Cooling Misting",
      0.85,
    );
    const base = analyzeAndRankTajaCandidates([
      { result: ambiguous, preliminaryCostEstimate: estimate(7.8) },
    ], {
      quantity: 100,
      targetMarginPercent: 30,
      productQuery,
    });
    expect(base.analyses[0]).toMatchObject({
      landedCostStatus: TajaLandedCostStatuses.ESTIMATED,
      preliminaryCostEstimate: expect.objectContaining({ basePerUnitEur: 7.8 }),
    });

    const applied = applyTajaProductFormPolicy({
      rankedResults: base.rankedResults,
      analyses: base.analyses,
      productQuery,
    });

    expect(applied.analyses[0]).toMatchObject({
      finalEligible: false,
      landedCostStatus: TajaLandedCostStatuses.UNAVAILABLE,
      preliminaryCostEstimate: null,
      productForm: {
        form: TajaOfferProductForms.UNCLEAR,
        matchStatus: TajaProductFormMatchStatuses.UNCLEAR,
      },
    });
    expect(applied.analyses[0]?.explanation).toContain(
      "Nije potvrđeno da prikazana cena obuhvata kompletan traženi sistem",
    );
  });
});
