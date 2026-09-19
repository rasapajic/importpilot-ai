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

describe("supplier commercial price signal", () => {
  it("accepts a positive priced offer", () => {
    expect(hasUsableSupplierOfferPrice(offer(), 100)).toBe(true);
  });

  it("marks offers without any price or currency as not yet commercially priced", () => {
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

  it("does not hide relevant supplier pages just because price is missing", () => {
    const service = readFileSync(
      join(process.cwd(), "modules/product-search/application/product-search-service.ts"),
      "utf8",
    );
    expect(service).not.toContain("candidateResults = candidateResults.filter((result) =>");
    expect(service).not.toContain("hasUsableSupplierOfferPrice(result");
    expect(service).toContain("urlImportProvider: getSupplierOfferUrlImportProvider()");
  });

  it("labels missing supplier price as an RFQ instead of an unusable result", () => {
    const simpleSearch = readFileSync(
      join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"),
      "utf8",
    );
    expect(simpleSearch).toContain('priceOnRequest: "Cena na upit"');
    expect(simpleSearch).toContain("text.priceOnRequest");
    expect(simpleSearch).toContain('landedPending: "čeka potvrđenu cenu dobavljača"');
  });
});
