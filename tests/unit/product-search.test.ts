import { describe, expect, it } from "vitest";

import {
  supplierOfferSearchInputSchema,
  projectSupplierSearchRequestSchema,
  supplierOfferSearchResultSchema,
  type SupplierOfferSearchProvider,
} from "../../modules/product-search/domain/search";

describe("supplier offer search provider contract", () => {
  it("supports an asynchronous provider without coupling to a marketplace", async () => {
    const provider: SupplierOfferSearchProvider = {
      async searchSupplierOffers(input) {
        supplierOfferSearchInputSchema.parse(input);
        return [{
          title: "Industrial fan",
          supplierName: "Example Supplier",
          supplierCountry: "CN",
          price: 12.5,
          currency: "USD",
          minimumOrderQuantity: 100,
          incoterm: "FOB",
          productUrl: "https://provider.example/products/industrial-fan",
          imageUrl: null,
          source: "provider-example",
        }];
      },
    };

    const results = await provider.searchSupplierOffers({
      query: "industrial fan",
      quantity: 500,
      targetCountry: "DE",
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("provider-example");
  });

  it("accepts unsupported optional fields as missing", () => {
    const result = supplierOfferSearchResultSchema.parse({
      title: "Industrial fan",
      supplierName: "Example Supplier",
      productUrl: "https://provider.example/products/industrial-fan",
      source: "provider-example",
    });
    expect(result.price).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.minimumOrderQuantity).toBeNull();
    expect(result.incoterm).toBeNull();
    expect(result.imageUrl).toBeNull();
  });

  it("rejects incomplete prices, invalid URLs and raw fields", () => {
    expect(supplierOfferSearchResultSchema.safeParse({
      title: "Industrial fan",
      supplierName: "Example Supplier",
      price: 10,
      productUrl: "https://provider.example/product",
      source: "provider-example",
    }).success).toBe(false);
    expect(supplierOfferSearchResultSchema.safeParse({
      title: "Industrial fan",
      supplierName: "Example Supplier",
      productUrl: "not-a-url",
      source: "provider-example",
      rawHtml: "<html />",
    }).success).toBe(false);
  });

  it("validates manual quantity and target country search overrides", () => {
    expect(projectSupplierSearchRequestSchema.parse({
      query: "industrial fan",
      quantity: 250,
      targetCountry: "at",
    })).toEqual({
      query: "industrial fan",
      quantity: 250,
      targetCountry: "AT",
    });
    expect(projectSupplierSearchRequestSchema.safeParse({
      query: "industrial fan",
      quantity: 0,
      targetCountry: "Austria",
    }).success).toBe(false);
  });
});
