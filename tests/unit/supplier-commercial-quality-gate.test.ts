import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasUsableSupplierOfferPrice,
} from "../../modules/product-search/domain/supplier-quantity-pricing";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function offer(overrides: Partial<SupplierOfferSearchResult> = {}): SupplierOfferSearchResult {
  return {
    title: "Garden LED lamp",
    supplierName: "Example Supplier",
    supplierCountry: "CN",
    price: 1.25,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.en.made-in-china.com/product/example.html",
    imageUrl: null,
    source: "made-in-china.com",
    marketplaceDetails: null,
    ...overrides,
  };
}

describe("supplier commercial quality gate", () => {
  it("accepts a positive priced offer", () => {
    expect(hasUsableSupplierOfferPrice(offer(), 100)).toBe(true);
  });

  it("rejects offers without any price or currency", () => {
    expect(hasUsableSupplierOfferPrice(offer({ price: null, currency: null }), 100)).toBe(false);
    expect(hasUsableSupplierOfferPrice(offer({ price: 0, currency: "USD" }), 100)).toBe(false);
  });

  it("accepts a source price tier for the requested quantity", () => {
    const tiered = offer({
      price: null,
      currency: null,
      marketplaceDetails: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
        priceTiers: [{ price: 0.9, currency: "USD", minQuantity: 100, maxQuantity: 499 }],
        attributes: [],
        variants: [],
        packaging: null,
      },
    });
    expect(hasUsableSupplierOfferPrice(tiered, 100)).toBe(true);
  });

  it("keeps the price gate and cached exact-page refresh in the presentation pipeline", () => {
    const service = readFileSync(
      join(process.cwd(), "modules/product-search/application/product-search-service.ts"),
      "utf8",
    );
    expect(service).toContain("hasUsableSupplierOfferPrice");
    expect(service).toContain("urlImportProvider: getSupplierOfferUrlImportProvider()");
  });
});
