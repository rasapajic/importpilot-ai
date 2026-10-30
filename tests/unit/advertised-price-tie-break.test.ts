import { describe, expect, it } from "vitest";

import { canPresentBestChoice } from "../../modules/product-search/domain/explicit-product-constraints";
import {
  inquiryContactPriority,
  preliminaryAdvertisedScorePresentation,
} from "../../modules/product-search/domain/advertised-price-tie-break";
import { unverifiedPresentationTies } from "../../modules/product-search/domain/unverified-offer-presentation";
import { rankPreliminarySupplierOffers } from "../../modules/product-search/domain/preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

const glasses = [
  { id: "zlin", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1.2, listedMoq: 12, confirmedPurchasePrice: false },
  { id: "wzouyuan", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false },
  { id: "readsun", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1, listedMoq: 200, confirmedPurchasePrice: false },
];

describe("quote-request priority from advertised prices", () => {
  it("orders the saved glasses by conditional advertised price without calling it a confirmed offer", () => {
    const priority = inquiryContactPriority(glasses);

    expect(priority).toMatchObject({
      orderedIds: ["wzouyuan", "readsun", "zlin"],
      priceUsed: true,
      reason: "CONDITIONAL_ADVERTISED",
      priorityById: { wzouyuan: 1, readsun: 2, zlin: 3 },
      lowestAdvertisedId: "wzouyuan",
      excludedIds: [],
    });
  });

  it("does not invent a price order when currencies differ", () => {
    const mixed = glasses.map((offer, index) => (
      index === 1 ? { ...offer, currency: "EUR" } : offer
    ));

    expect(inquiryContactPriority(mixed)).toMatchObject({
      orderedIds: ["zlin", "wzouyuan", "readsun"],
      priceUsed: false,
      reason: "CURRENCY",
      priorityById: {},
      lowestAdvertisedId: null,
    });
  });

  it("keeps a cheaper incompatible listing out of the inquiry order", () => {
    const priority = inquiryContactPriority([
      ...glasses,
      { id: "progressive", suitability: "DISQUALIFIED" as const, currency: "USD", advertisedPrice: 0.2, listedMoq: 12, confirmedPurchasePrice: false },
    ]);

    expect(priority.orderedIds).toEqual(["wzouyuan", "readsun", "zlin", "progressive"]);
    expect(priority.excludedIds).toEqual(["progressive"]);
    expect(priority.priorityById.progressive).toBeUndefined();
    expect(priority.lowestAdvertisedId).toBe("wzouyuan");
  });

  it("gives the cheaper advertised price a capped provisional score and leaves confidence untouched", () => {
    const presented = preliminaryAdvertisedScorePresentation(glasses.map((offer) => ({
      ...offer,
      baseScore: 55,
    })));
    const byId = Object.fromEntries(presented.map((score) => [score.id, score]));

    expect(byId.wzouyuan).toMatchObject({ priceIndicatorBonus: 5, preliminaryDisplayedScore: 60, priceCompared: true });
    expect(byId.readsun).toMatchObject({ priceIndicatorBonus: 2, preliminaryDisplayedScore: 57, priceCompared: true });
    expect(byId.zlin).toMatchObject({ priceIndicatorBonus: 0, preliminaryDisplayedScore: 55, priceCompared: true });
    expect(glasses.map(() => 24)).toEqual([24, 24, 24]);
    expect(unverifiedPresentationTies(presented.map((score) => ({
      id: score.id,
      overallScore: score.preliminaryDisplayedScore,
      confidenceScore: 24,
      finalEligible: false,
      suitability: "NEEDS_CONFIRMATION" as const,
    })))).toEqual([]);
    expect(canPresentBestChoice({
      status: "NEEDS_CONFIRMATION",
      confidenceScore: 24,
      finalEligible: false,
    })).toBe(false);
  });

  it("does not let a cheaper progressive listing take the bonus or a final badge", () => {
    const presented = preliminaryAdvertisedScorePresentation([
      ...glasses.map((offer) => ({ ...offer, baseScore: 55 })),
      { id: "progressive", suitability: "DISQUALIFIED" as const, currency: "USD", advertisedPrice: 0.2, listedMoq: 12, confirmedPurchasePrice: false, baseScore: 55 },
    ]);
    const progressive = presented.find((score) => score.id === "progressive");
    const wzouyuan = presented.find((score) => score.id === "wzouyuan");

    expect(progressive).toMatchObject({ priceIndicatorBonus: 0, preliminaryDisplayedScore: 55, priceCompared: false });
    expect(wzouyuan?.preliminaryDisplayedScore).toBe(60);
    expect((progressive?.preliminaryDisplayedScore ?? 0) > (wzouyuan?.preliminaryDisplayedScore ?? 0)).toBe(false);
  });

  it("shares one bonus when advertised prices tie and caps the shown score at 100", () => {
    const presented = preliminaryAdvertisedScorePresentation([
      { id: "low-a", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 12, confirmedPurchasePrice: false, baseScore: 98 },
      { id: "low-b", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false, baseScore: 55 },
      { id: "high", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1.2, listedMoq: 200, confirmedPurchasePrice: false, baseScore: 55 },
    ]);

    expect(presented.map((score) => score.preliminaryDisplayedScore)).toEqual([100, 60, 55]);
    expect(inquiryContactPriority(presented.map((score) => ({
      id: score.id,
      suitability: "NEEDS_CONFIRMATION" as const,
      currency: "USD",
      advertisedPrice: score.id === "high" ? 1.2 : 0.35,
      listedMoq: null,
      confirmedPurchasePrice: false,
    }))).lowestAdvertisedId).toBeNull();
  });

  it("adds no score bonus and no inquiry numbers when prices cannot be compared", () => {
    const cases = [
      glasses.map((offer, index) => index === 0 ? offer : { ...offer, advertisedPrice: null }),
      glasses.map((offer, index) => index === 1 ? { ...offer, currency: "EUR" } : offer),
      glasses.map((offer) => ({ ...offer, advertisedPrice: Number.NaN })),
      glasses.map((offer) => ({ ...offer, advertisedPrice: 0 })),
      glasses.map((offer) => ({ ...offer, advertisedPrice: -1 })),
    ];

    for (const offers of cases) {
      const priority = inquiryContactPriority(offers);
      const presented = preliminaryAdvertisedScorePresentation(offers.map((offer) => ({ ...offer, baseScore: 55 })));
      expect(priority.priceUsed).toBe(false);
      expect(priority.priorityById).toEqual({});
      expect(presented.every((score) => score.priceIndicatorBonus === 0 && score.preliminaryDisplayedScore === 55)).toBe(true);
    }
  });

  it("leaves a missing price out of the numbers when the other advertisements still compare", () => {
    const offers = glasses.map((offer) => (
      offer.id === "readsun" ? { ...offer, advertisedPrice: null } : offer
    ));
    const priority = inquiryContactPriority(offers);
    const presented = preliminaryAdvertisedScorePresentation(offers.map((offer) => ({ ...offer, baseScore: 55 })));

    expect(priority.priceUsed).toBe(true);
    expect(priority.priorityById).toEqual({ wzouyuan: 1, zlin: 2 });
    expect(priority.priorityById.readsun).toBeUndefined();
    expect(presented.find((score) => score.id === "readsun")).toMatchObject({
      priceIndicatorBonus: 0,
      preliminaryDisplayedScore: 55,
      priceCompared: false,
    });
    expect(presented.find((score) => score.id === "wzouyuan")?.preliminaryDisplayedScore).toBe(60);
    expect(presented.find((score) => score.id === "zlin")?.preliminaryDisplayedScore).toBe(55);
  });

  it("does not add the advertised bonus on top of a confirmed purchase price", () => {
    const presented = preliminaryAdvertisedScorePresentation([
      { id: "quoted", suitability: "COMPATIBLE" as const, currency: "USD", advertisedPrice: 0.1, listedMoq: 1000, confirmedPurchasePrice: true, baseScore: 70 },
      { id: "listed", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false, baseScore: 55 },
      { id: "other", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1, listedMoq: 200, confirmedPurchasePrice: false, baseScore: 55 },
    ]);

    expect(presented.find((score) => score.id === "quoted")).toMatchObject({
      priceIndicatorBonus: 0,
      preliminaryDisplayedScore: 70,
      priceCompared: false,
    });
    expect(presented.find((score) => score.id === "listed")?.priceIndicatorBonus).toBe(5);
  });

  it("leaves the separate preliminary score ranker unchanged", () => {
    const request = "naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nije progresivno";
    const result = (name: string, price: number, moq: number): SupplierOfferSearchResult => ({
      title: `${name} reading glasses`,
      supplierName: name,
      supplierCountry: "CN",
      price,
      currency: "USD",
      minimumOrderQuantity: moq,
      incoterm: null,
      productUrl: `https://example.com/${name}`,
      imageUrl: null,
      source: "Made-in-China",
    });

    expect(rankPreliminarySupplierOffers([
      result("zlin", 1.2, 12),
      result("wzouyuan", 0.35, 100),
      result("readsun", 1, 200),
    ], { quantity: 1000, productQuery: request }).map((offer) => offer.supplierName)).toEqual([
      "zlin",
      "wzouyuan",
      "readsun",
    ]);
  });

  it("keeps a seller's larger MOQ visible but does not rank its teaser as a price for 1,000", () => {
    const offers = [
      { id: "dilicin", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.18, listedMoq: 1200, confirmedPurchasePrice: false },
      { id: "wzouyuan", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false },
      { id: "readsun", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 1, listedMoq: 200, confirmedPurchasePrice: false },
    ];
    const order = inquiryContactPriority(offers, 1000);
    expect(order.orderedIds).toEqual(["wzouyuan", "readsun", "dilicin"]);
    expect(order.priorityById).toEqual({ wzouyuan: 1, readsun: 2 });
    expect(order.lowestAdvertisedId).toBe("wzouyuan");
    const scores = preliminaryAdvertisedScorePresentation(
      offers.map((offer) => ({ ...offer, baseScore: 55 })),
      1000,
    );
    expect(scores.find((item) => item.id === "dilicin")).toMatchObject({
      priceIndicatorBonus: 0, preliminaryDisplayedScore: 55, priceCompared: false,
    });
    expect(scores.find((item) => item.id === "wzouyuan")?.priceIndicatorBonus).toBe(5);
    // The advertised 0.18 is still displayed on Dilicin's own card:
    // quantity eligibility does not remove the original supplier offer.
    expect(offers[0]).toMatchObject({ advertisedPrice: 0.18, listedMoq: 1200 });
  });

  it("does not fabricate a buyer-quantity price priority when only one offer meets its minimum", () => {
    const offers = [
      { id: "dilicin", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.18, listedMoq: 1200, confirmedPurchasePrice: false },
      { id: "wzouyuan", suitability: "NEEDS_CONFIRMATION" as const, currency: "USD", advertisedPrice: 0.35, listedMoq: 100, confirmedPurchasePrice: false },
    ];
    expect(inquiryContactPriority(offers, 1000)).toMatchObject({
      orderedIds: ["dilicin", "wzouyuan"],
      priceUsed: false,
      priorityById: {},
    });
    expect(preliminaryAdvertisedScorePresentation(
      offers.map((offer) => ({ ...offer, baseScore: 55 })),
      1000,
    ).map((item) => item.priceIndicatorBonus)).toEqual([0, 0]);
    expect(inquiryContactPriority(offers, 1200).priorityById).toEqual({
      dilicin: 1, wzouyuan: 2,
    });
  });

});
