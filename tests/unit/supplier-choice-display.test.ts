import { describe, expect, it } from "vitest";

import {
  quantityPriceSnapshots,
  supplierPriceTierSnapshots,
  supplierOfferForQuantity,
  supplierOfferVariantFacts,
} from "../../components/search/supplier-choice-display";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function offer(overrides: Partial<SupplierOfferSearchResult> = {}): SupplierOfferSearchResult {
  return {
    title: "100W USB-C to USB-C Magnetic Data Charging Cable 1m 2m",
    supplierName: "Shenzhen Cable Supplier Co., Ltd.",
    supplierCountry: "CN",
    price: 1.2,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.en.made-in-china.com/product/example.html",
    imageUrl: "https://example.com/original-product.jpg",
    source: "made-in-china.com",
    marketplaceDetails: {
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [
        { price: 1.2, currency: "USD", minQuantity: 100, maxQuantity: 499 },
        { price: 0.95, currency: "USD", minQuantity: 500, maxQuantity: 999 },
        { price: 0.82, currency: "USD", minQuantity: 1_000, maxQuantity: null },
      ],
      attributes: [],
      variants: [{ name: "Length", values: ["1 m", "2 m"] }],
      packaging: null,
    },
    ...overrides,
  };
}

describe("supplier choice display", () => {
  it("uses the source price tier that applies to the requested quantity", () => {
    const result = supplierOfferForQuantity(offer(), 500);
    expect(result.price).toBe(0.95);
    expect(result.currency).toBe("USD");
  });

  it("shows requested, 500 and 1000 quantity prices from source tiers", () => {
    expect(quantityPriceSnapshots(offer(), 100)).toEqual([
      { quantity: 100, price: 1.2, currency: "USD", confirmedByTier: true },
      { quantity: 500, price: 0.95, currency: "USD", confirmedByTier: true },
      { quantity: 1_000, price: 0.82, currency: "USD", confirmedByTier: true },
    ]);
  });

  it("returns every source-published quantity tier for display", () => {
    expect(supplierPriceTierSnapshots(offer())).toEqual([
      { minQuantity: 100, maxQuantity: 499, price: 1.2, currency: "USD" },
      { minQuantity: 500, maxQuantity: 999, price: 0.95, currency: "USD" },
      { minQuantity: 1_000, maxQuantity: null, price: 0.82, currency: "USD" },
    ]);
  });

  it("does not invent a price for a quantity the source did not publish", () => {
    const result = offer({
      marketplaceDetails: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
        priceTiers: [{ price: 1.2, currency: "USD", minQuantity: 100, maxQuantity: 499 }],
        attributes: [],
        variants: [],
        packaging: null,
      },
    });
    expect(quantityPriceSnapshots(result, 100)).toEqual([
      { quantity: 100, price: 1.2, currency: "USD", confirmedByTier: true },
      { quantity: 500, price: null, currency: null, confirmedByTier: false },
      { quantity: 1_000, price: null, currency: null, confirmedByTier: false },
    ]);
  });

  it("surfaces source-grounded cable variants and title facts", () => {
    expect(supplierOfferVariantFacts(offer())).toEqual({
      groups: [{ name: "Length", values: ["1 m", "2 m"] }],
      types: ["Magnetic", "Data", "Charging"],
    });
  });
});
