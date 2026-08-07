import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
  TajaCandidateAnalysisStatuses,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(
  productUrl: string,
  title: string,
): SupplierOfferSearchResult {
  return {
    title,
    supplierName: "Example supplier",
    supplierCountry: "CN",
    price: 10,
    currency: "USD",
    minimumOrderQuantity: 50,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "TAJA test",
  };
}

describe("TAJA requirement-aware ranking", () => {
  const context = {
    quantity: 100,
    targetMarginPercent: 30,
    productQuery: "Vodena magla za terasu sa pumpom i 20 mlaznica",
  };

  it("ranks a fully matching offer above a partially confirmed offer", () => {
    const full = result(
      "https://supplier.example/full",
      "Patio Water Misting System with Pump and 20 Nozzles",
    );
    const partial = result(
      "https://supplier.example/partial",
      "Patio Misting Cooling System",
    );

    const analyzed = analyzeAndRankTajaCandidates([
      { result: partial },
      { result: full },
    ], context);

    expect(analyzed.rankedResults.map((candidate) => candidate.productUrl)).toEqual([
      full.productUrl,
      partial.productUrl,
    ]);
    expect(analyzed.analyses[0]?.requirementMatch.status).toBe("FULL");
    expect(analyzed.analyses[1]).toMatchObject({
      status: TajaCandidateAnalysisStatuses.PRELIMINARY,
      finalEligible: false,
      requirementMatch: { status: "PARTIAL" },
      missingData: expect.arrayContaining(["PRODUCT_REQUIREMENTS"]),
    });
  });

  it("does not expose internal missing-data codes in the user explanation", () => {
    const partial = result(
      "https://supplier.example/partial-explanation",
      "Patio Misting Cooling System",
    );

    const analyzed = analyzeAndRankTajaCandidates([{ result: partial }], context);
    const explanation = analyzed.analyses[0]?.explanation ?? "";

    expect(explanation).toContain("Preporuka ostaje preliminarna");
    expect(explanation).not.toContain("CORE_OFFER_DATA");
    expect(explanation).not.toContain("PRODUCT_REQUIREMENTS");
    expect(explanation).not.toContain("SUPPLIER_RISK_DATA");
  });
});
