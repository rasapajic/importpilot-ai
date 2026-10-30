import { describe, expect, it } from "vitest";

import { analyzeAndRankTajaCandidates } from "../../modules/product-search/domain/taja-candidate-analysis";
import { rankPreliminarySupplierOffers } from "../../modules/product-search/domain/preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";
import { unverifiedPresentationTies } from "../../modules/product-search/domain/unverified-offer-presentation";

const REQUEST = "naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nije progresivno";

function savedOffer(id: string, score: number, confidence: number, suitability: "NEEDS_CONFIRMATION" | "DISQUALIFIED" = "NEEDS_CONFIRMATION") {
  return {
    id,
    overallScore: score,
    confidenceScore: confidence,
    finalEligible: false,
    suitability,
  } as const;
}

describe("equivalent unverified offer presentation", () => {
  it("labels a saved 55/100 and 24% tie as one unverified level, without reordering by price or MOQ", () => {
    const saved = [
      savedOffer("zlin", 55, 24),
      savedOffer("wzouyuan", 55, 24),
      savedOffer("readsun", 55, 24),
    ];

    expect(unverifiedPresentationTies(saved)).toEqual([{
      score: 55,
      confidence: 24,
      suitability: "NEEDS_CONFIRMATION",
      ids: ["zlin", "wzouyuan", "readsun"],
    }]);
  });

  it("does not treat a disqualified offer or a different score as the same unverified level", () => {
    const ties = unverifiedPresentationTies([
      savedOffer("zlin", 55, 24),
      savedOffer("progressive", 15, 24, "DISQUALIFIED"),
      savedOffer("other", 70, 24),
    ]);

    expect(ties).toEqual([]);
  });
});

describe("unconfirmed reading-glass order", () => {
  function offer(input: {
    name: string;
    price: number;
    moq: number;
  }): SupplierOfferSearchResult {
    return {
      title: `${input.name} reading glasses`,
      supplierName: input.name,
      supplierCountry: "CN",
      price: input.price,
      currency: "USD",
      minimumOrderQuantity: input.moq,
      incoterm: null,
      productUrl: `https://example.com/${input.name}`,
      imageUrl: null,
      source: "Made-in-China",
    };
  }

  const zlin = offer({ name: "zlin", price: 1.2, moq: 12 });
  const wzouyuan = offer({ name: "wzouyuan", price: 0.35, moq: 100 });
  const readsun = offer({ name: "readsun", price: 1, moq: 200 });

  it("does not treat a lower advertised price as a better unconfirmed offer", () => {
    const ordered = rankPreliminarySupplierOffers(
      [zlin, wzouyuan, readsun],
      { quantity: 1000, productQuery: REQUEST },
    );

    expect(ordered.map((result) => result.productUrl)).toEqual([
      zlin.productUrl,
      wzouyuan.productUrl,
      readsun.productUrl,
    ]);
  });

  it("keeps equal unverified analyses in display order when the visible score and confidence match", () => {
    const analyzed = analyzeAndRankTajaCandidates([
      { result: zlin },
      { result: wzouyuan },
      { result: readsun },
    ], {
      quantity: 1000,
      targetMarginPercent: 0,
      productQuery: REQUEST,
    });
    const scores = analyzed.analyses.map((analysis) => analysis.overallScore);
    const confidence = analyzed.analyses.map((analysis) => analysis.confidenceScore);

    expect(new Set(scores).size).toBe(1);
    expect(new Set(confidence).size).toBe(1);
    expect(analyzed.analyses.every((analysis) => analysis.finalEligible === false)).toBe(true);
    expect(unverifiedPresentationTies(analyzed.analyses.map((analysis) => ({
      id: analysis.productUrl,
      overallScore: analysis.overallScore,
      confidenceScore: analysis.confidenceScore,
      finalEligible: analysis.finalEligible,
      suitability: "NEEDS_CONFIRMATION" as const,
    }))).map((tie) => tie.ids)).toEqual([[
      zlin.productUrl,
      wzouyuan.productUrl,
      readsun.productUrl,
    ]]);
  });
});
