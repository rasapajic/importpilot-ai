import { describe, expect, it } from "vitest";

import { analyzeAndRankTajaCandidates } from "../../modules/product-search/domain/taja-candidate-analysis";
import { TajaPriceSignalStatuses } from "../../modules/product-search/domain/taja-price-signal";
import {
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
} from "../../modules/product-search/domain/taja-product-form";
import { applyTajaProductFormPolicy } from "../../modules/product-search/domain/taja-product-form-policy";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

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

describe("TAJA product-form policy", () => {
  it("keeps complete systems above nozzle-only offers and isolates price groups", () => {
    const results = [
      result("system-10", "Patio Misting System Kit with Pump and 20 Nozzles", 10),
      result("system-12", "Terrace Misting System with Pump and 20 Nozzles", 12),
      result("system-15", "Patio Water Misting System with Pump and 20 Nozzles", 15),
      result("nozzles", "Misting System Mist Nozzles Outdoor Nozzles for Pool Cooling", 0.65),
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
});
