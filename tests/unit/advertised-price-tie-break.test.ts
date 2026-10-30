import { describe, expect, it } from "vitest";

import { inquiryContactPriority } from "../../modules/product-search/domain/advertised-price-tie-break";
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
});
