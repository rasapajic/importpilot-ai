import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
  TajaCandidateAnalysisStatuses,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import {
  evaluateTajaPriceSignal,
  TajaPriceSignalStatuses,
} from "../../modules/product-search/domain/taja-price-signal";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(name: string, price: number): SupplierOfferSearchResult {
  return {
    title: `${name} patio misting system`,
    supplierName: `${name} supplier`,
    supplierCountry: "CN",
    price,
    currency: "USD",
    minimumOrderQuantity: 1,
    incoterm: "FOB",
    productUrl: `https://supplier.example/${name.toLowerCase()}`,
    imageUrl: null,
    source: "TAJA test",
  };
}

describe("TAJA supplier price signals", () => {
  it("flags a several-times-higher same-currency price without calling it false", () => {
    const candidates = [
      result("Normal-A", 10),
      result("Normal-B", 11),
      result("Normal-C", 12),
      result("Industrial", 2_050),
    ];

    expect(evaluateTajaPriceSignal(candidates[3]!, candidates)).toMatchObject({
      status: TajaPriceSignalStatuses.HIGH_OUTLIER,
      comparableCount: 4,
      medianPrice: 11.5,
      scoreAdjustment: -20,
    });
    expect(evaluateTajaPriceSignal(candidates[0]!, candidates).status)
      .toBe(TajaPriceSignalStatuses.NORMAL);
  });

  it("flags an unusually low price basis for verification", () => {
    const candidates = [
      result("Starting", 0.5),
      result("Normal-A", 10),
      result("Normal-B", 11),
      result("Normal-C", 12),
    ];

    expect(evaluateTajaPriceSignal(candidates[0]!, candidates)).toMatchObject({
      status: TajaPriceSignalStatuses.LOW_OUTLIER,
      medianPrice: 10.5,
      scoreAdjustment: -12,
    });
  });

  it("keeps a price outlier preliminary and below normal comparable offers", () => {
    const candidates = [
      result("Industrial", 2_050),
      result("Normal-A", 10),
      result("Normal-B", 11),
      result("Normal-C", 12),
    ];
    const analyzed = analyzeAndRankTajaCandidates(
      candidates.map((candidate) => ({ result: candidate })),
      { quantity: 100, targetMarginPercent: 30 },
    );

    expect(analyzed.rankedResults.at(-1)?.productUrl)
      .toBe(candidates[0]?.productUrl);
    expect(analyzed.analyses.at(-1)).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      finalEligible: false,
      priceSignal: { status: TajaPriceSignalStatuses.HIGH_OUTLIER },
      missingData: expect.arrayContaining(["PRICE_BASIS"]),
    });
  });
});
