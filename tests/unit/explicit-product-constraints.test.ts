import { describe, expect, it } from "vitest";

import {
  analyzeAndRankTajaCandidates,
} from "../../modules/product-search/domain/taja-candidate-analysis";
import {
  allowGenericProductMatchClaim,
  canPresentBestChoice,
  canPresentPreliminaryCandidate,
  evaluateExplicitProductConstraints,
} from "../../modules/product-search/domain/explicit-product-constraints";
import { formatMissingDataLabels } from "../../modules/product-search/domain/taja-missing-data-copy";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const REQUEST = "naočare za čitanje +1.00 do +3.50, mešovito, fiksne dioptrije, nije progresivno, 1000 kom";

function result(title: string, productUrl: string): SupplierOfferSearchResult {
  return {
    title,
    supplierName: "Example supplier",
    supplierCountry: "CN",
    price: 1.2,
    currency: "USD",
    minimumOrderQuantity: 12,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "Made-in-China",
  };
}

describe("explicit reading-glass constraints", () => {
  it("disqualifies a progressive adjustable listing for a fixed non-progressive request", () => {
    const assessment = evaluateExplicitProductConstraints(
      REQUEST,
      result(
        "Adjustable +4.00 Progressive Multifocal Reading Glasses",
        "https://wzouyuan.en.made-in-china.com/product/example.html",
      ),
    );

    expect(assessment.status).toBe("DISQUALIFIED");
    expect(assessment.reasons).toEqual(expect.arrayContaining([
      "PROGRESSIVE_OR_ADJUSTABLE_LENS",
      "DIOPTER_OUTSIDE_REQUEST",
    ]));
    expect(assessment.scoreAdjustment).toBe(-40);
  });

  it("keeps an ordinary reading-glass listing unconfirmed instead of calling it compatible", () => {
    const assessment = evaluateExplicitProductConstraints(
      REQUEST,
      result(
        "Wholesale reading glasses model 18107",
        "https://zlineyewear.en.made-in-china.com/product/example.html",
      ),
    );

    expect(assessment).toMatchObject({
      status: "NEEDS_CONFIRMATION",
      reasons: ["LENS_TYPE_UNCONFIRMED"],
      scoreAdjustment: 0,
    });
  });

  it("accepts a listing only when the source states a fixed lens inside the requested range", () => {
    const assessment = evaluateExplicitProductConstraints(
      REQUEST,
      result(
        "Single vision fixed diopter reading glasses +1.00 +1.50 +2.00 +2.50 +3.00 +3.50",
        "https://readsunoptical.en.made-in-china.com/product/example.html",
      ),
    );

    expect(assessment.status).toBe("COMPATIBLE");
    expect(assessment.reasons).toEqual(["FIXED_LENS_CONFIRMED"]);
  });

  it("does not treat an advertised price as a diopter or a fan listing as a reading-glass conflict", () => {
    expect(evaluateExplicitProductConstraints(
      REQUEST,
      result(
        "Reading glasses US$1.20-2.90",
        "https://zlineyewear.en.made-in-china.com/product/price.html",
      ),
    ).reasons).not.toContain("DIOPTER_OUTSIDE_REQUEST");

    expect(evaluateExplicitProductConstraints(
      "industrial fan",
      result(
        "Adjustable +4.00 Progressive Multifocal Reading Glasses",
        "https://supplier.example/fan",
      ),
    ).status).toBe("NOT_APPLICABLE");
  });

  it("does not call a low-confidence or unconfirmed offer the best choice", () => {
    expect(canPresentBestChoice({
      status: "DISQUALIFIED",
      confidenceScore: 24,
      finalEligible: false,
    })).toBe(false);
    expect(canPresentBestChoice({
      status: "NEEDS_CONFIRMATION",
      confidenceScore: 24,
      finalEligible: false,
    })).toBe(false);
    expect(canPresentBestChoice({
      status: "COMPATIBLE",
      confidenceScore: 24,
      finalEligible: false,
    })).toBe(false);
    expect(canPresentBestChoice({
      status: "NOT_APPLICABLE",
      confidenceScore: 24,
      finalEligible: false,
    })).toBe(false);
  });

  it("withholds the final best-choice label when confidence is high but landed cost is not eligible", () => {
    const listingOnly = {
      status: "COMPATIBLE" as const,
      confidenceScore: 60,
      finalEligible: false,
    };

    expect(canPresentBestChoice(listingOnly)).toBe(false);
    expect(canPresentPreliminaryCandidate(listingOnly)).toBe(true);
    expect(canPresentBestChoice({
      status: "COMPATIBLE",
      confidenceScore: 90,
      finalEligible: true,
    })).toBe(true);
    expect(canPresentPreliminaryCandidate({
      status: "COMPATIBLE",
      confidenceScore: 90,
      finalEligible: true,
    })).toBe(false);
    expect(canPresentPreliminaryCandidate({
      status: "NEEDS_CONFIRMATION",
      confidenceScore: 80,
      finalEligible: false,
    })).toBe(false);
  });

  it("reads an explicit Serbian Cyrillic non-progressive request", () => {
    const cyrillicRequest = "наочаре за читање +1.00 до +3.50, фиксне диоптрије, није прогресивно, 1000 ком";

    expect(evaluateExplicitProductConstraints(
      cyrillicRequest,
      result(
        "Adjustable +4.00 Progressive Multifocal Reading Glasses",
        "https://wzouyuan.en.made-in-china.com/product/example.html",
      ),
    ).status).toBe("DISQUALIFIED");
    expect(evaluateExplicitProductConstraints(
      cyrillicRequest,
      result(
        "Wholesale reading glasses model 18107",
        "https://zlineyewear.en.made-in-china.com/product/example.html",
      ),
    ).status).toBe("NEEDS_CONFIRMATION");
  });

  it("does not let a default product-form match claim compatibility", () => {
    expect(allowGenericProductMatchClaim({
      requirementStatus: "NOT_EVALUATED",
      productFormStatus: "MATCH",
      requestedCompleteSystem: false,
      constraintStatus: "NEEDS_CONFIRMATION",
    })).toBe(false);
    expect(allowGenericProductMatchClaim({
      requirementStatus: "NOT_EVALUATED",
      productFormStatus: "MATCH",
      requestedCompleteSystem: false,
      constraintStatus: "NOT_APPLICABLE",
    })).toBe(false);
  });

  it("ranks a disqualified progressive offer behind an unconfirmed reading-glass offer", () => {
    const progressive = result(
      "Adjustable +4.00 Progressive Multifocal Reading Glasses",
      "https://wzouyuan.en.made-in-china.com/product/example.html",
    );
    const unconfirmed = result(
      "Wholesale reading glasses model 18107",
      "https://zlineyewear.en.made-in-china.com/product/example.html",
    );
    const analyzed = analyzeAndRankTajaCandidates([
      { result: progressive },
      { result: unconfirmed },
    ], {
      quantity: 1000,
      targetMarginPercent: 30,
      productQuery: REQUEST,
    });

    expect(analyzed.rankedResults.map((candidate) => candidate.productUrl)).toEqual([
      unconfirmed.productUrl,
      progressive.productUrl,
    ]);
    expect(analyzed.analyses[0]?.explanation).toContain("Tip sočiva nije dokazan");
    expect(analyzed.analyses[1]?.explanation).toContain("progresivna");
    expect(analyzed.analyses[1]?.finalEligible).toBe(false);
    expect(analyzed.analyses[1]?.missingData).toContain("PRODUCT_REQUIREMENTS");
    expect(analyzed.analyses[0]?.overallScore).toBeGreaterThan(analyzed.analyses[1]?.overallScore ?? 100);
  });

  it("shows readable missing-data labels instead of internal check codes", () => {
    const labels = formatMissingDataLabels(["CORE_OFFER_DATA", "LANDED_COST"], "sr");
    expect(labels).toBe("osnovni podaci ponude, potvrđen ukupan trošak uvoza");
    expect(labels).not.toContain("CORE_OFFER_DATA");
    expect(labels).not.toContain("LANDED_COST");
  });
});
