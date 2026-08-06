import { describe, expect, it } from "vitest";

import { rankPreliminarySupplierOffers } from "../../modules/product-search/domain/preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(
  title: string,
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title,
    supplierName: `${title} Supplier`,
    supplierCountry: "CN",
    price: 10,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: `https://supplier.example/${encodeURIComponent(title)}`,
    imageUrl: "https://supplier.example/product.jpg",
    source: "Test source",
    ...overrides,
  };
}

describe("preliminary supplier ranking", () => {
  it("places complete, competitively priced offers with a suitable MOQ first", () => {
    const expensive = result("Expensive", { price: 20 });
    const partial = result("Partial", {
      price: null,
      currency: null,
      minimumOrderQuantity: null,
      incoterm: null,
      supplierCountry: null,
      imageUrl: null,
    });
    const best = result("Best", { price: 8, minimumOrderQuantity: 50 });

    expect(rankPreliminarySupplierOffers(
      [expensive, partial, best],
      { quantity: 100 },
    ).map((candidate) => candidate.title)).toEqual([
      "Best",
      "Expensive",
      "Partial",
    ]);
  });

  it("penalizes a minimum order quantity above the requested quantity", () => {
    const suitable = result("Suitable", { price: 11, minimumOrderQuantity: 100 });
    const tooLarge = result("Too large", { price: 8, minimumOrderQuantity: 1_000 });

    expect(rankPreliminarySupplierOffers(
      [tooLarge, suitable],
      { quantity: 100 },
    )[0]?.title).toBe("Suitable");
  });

  it("keeps the original order when preliminary scores are equal", () => {
    const first = result("First");
    const second = result("Second");

    expect(rankPreliminarySupplierOffers(
      [first, second],
      { quantity: 100 },
    ).map((candidate) => candidate.title)).toEqual(["First", "Second"]);
  });
});
