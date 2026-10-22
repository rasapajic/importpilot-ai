import { describe, expect, it } from "vitest";

import { rankPreliminarySupplierOffers } from "../../modules/product-search/domain/preliminary-supplier-ranking";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(
  title: string,
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  const price = overrides.price === undefined ? 10 : overrides.price;
  const currency = overrides.currency === undefined ? "USD" : overrides.currency;
  const minimumOrderQuantity = overrides.minimumOrderQuantity === undefined
    ? 100
    : overrides.minimumOrderQuantity;
  const hasExplicitDetails = Object.prototype.hasOwnProperty.call(
    overrides,
    "marketplaceDetails",
  );
  const base: SupplierOfferSearchResult = {
    title,
    supplierName: `${title} Supplier`,
    supplierCountry: "CN",
    price,
    currency,
    minimumOrderQuantity,
    incoterm: "FOB",
    productUrl: `https://supplier.example/${encodeURIComponent(title)}`,
    imageUrl: "https://supplier.example/product.jpg",
    source: "Test source",
    ...overrides,
  };
  if (
    hasExplicitDetails ||
    price === null ||
    currency === null ||
    !Number.isInteger(minimumOrderQuantity) ||
    (minimumOrderQuantity ?? 0) <= 0
  ) {
    return base;
  }
  return {
    ...base,
    marketplaceDetails: {
      adapter: "confirmed-flat-tier",
      evidence: "PRODUCT_PAGE",
      priceTiers: [{
        price,
        currency,
        minQuantity: minimumOrderQuantity!,
        maxQuantity: null,
      }],
      attributes: [],
      variants: [],
      packaging: null,
    },
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

  it("does not raise an offer only because its listed MOQ is below the requested quantity", () => {
    const coveringTier = (price: number) => ({
      adapter: "confirmed-flat-tier",
      evidence: "PRODUCT_PAGE" as const,
      priceTiers: [{
        price,
        currency: "USD",
        minQuantity: 12,
        maxQuantity: null,
      }],
      attributes: [],
      variants: [],
      packaging: null,
    });
    const listedMoq = result("Listed MOQ", {
      price: 1.1,
      minimumOrderQuantity: 12,
      marketplaceDetails: coveringTier(1.1),
    });
    const cheaperWithoutListedMoq = result("Cheaper without listed MOQ", {
      price: 1,
      minimumOrderQuantity: null,
      marketplaceDetails: coveringTier(1),
    });

    expect(rankPreliminarySupplierOffers(
      [listedMoq, cheaperWithoutListedMoq],
      { quantity: 500 },
    )[0]?.title).toBe("Cheaper without listed MOQ");
  });

  it("does not rank an advertised floor price ahead of a confirmed quantity tier", () => {
    const advertisedFloor = result("Advertised floor", {
      price: 0.7,
      minimumOrderQuantity: 12,
      marketplaceDetails: null,
    });
    const confirmedTier = result("Confirmed tier", {
      price: 1.1,
      minimumOrderQuantity: 12,
    });

    expect(rankPreliminarySupplierOffers(
      [advertisedFloor, confirmedTier],
      { quantity: 500 },
    )[0]?.title).toBe("Confirmed tier");
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
