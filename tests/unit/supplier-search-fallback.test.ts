import { describe, expect, it, vi } from "vitest";

import { searchSupplierOffersWithPersistentFallback } from "../../modules/product-search/application/search-fallback";

const input = {
  query: "punjac za telefon typ c",
  quantity: 100,
  targetCountry: "RS",
};

const result = {
  title: "USB-C Phone Charger",
  supplierName: "Shenzhen Charger Supplier",
  supplierCountry: "CN",
  price: 3.5,
  currency: "USD",
  minimumOrderQuantity: 100,
  incoterm: "FOB",
  productUrl: "https://charger.en.made-in-china.com/product/usb-c-charger.html",
  imageUrl: null,
  source: "Made-in-China",
};

describe("supplier search persistent fallback", () => {
  it("returns live results and stores successful searches", async () => {
    const store = vi.fn().mockResolvedValue({});
    const outcome = await searchSupplierOffersWithPersistentFallback(
      input,
      { searchSupplierOffers: vi.fn().mockResolvedValue([result]) },
      { store, find: vi.fn() },
    );

    expect(outcome).toMatchObject({
      results: [result],
      resultOrigin: "live",
      liveProviderFailed: false,
      cacheHit: false,
      returnedFromCache: false,
    });
    expect(store).toHaveBeenCalledWith(input, [result]);
  });

  it("returns cached results without exposing a live provider error", async () => {
    const outcome = await searchSupplierOffersWithPersistentFallback(
      input,
      { searchSupplierOffers: vi.fn().mockRejectedValue(new Error("upstream failed")) },
      {
        store: vi.fn(),
        find: vi.fn().mockResolvedValue({
          results: [result],
          source: "Made-in-China",
          createdAt: new Date(),
          expiresAt: new Date(),
        }),
      },
    );

    expect(outcome).toMatchObject({
      results: [result],
      resultOrigin: "cache",
      liveProviderFailed: true,
      cacheHit: true,
      returnedFromCache: true,
    });
  });

  it("keeps the provider error when no cached result exists", async () => {
    const providerError = new Error("upstream failed");
    await expect(searchSupplierOffersWithPersistentFallback(
      input,
      { searchSupplierOffers: vi.fn().mockRejectedValue(providerError) },
      { store: vi.fn(), find: vi.fn().mockResolvedValue(null) },
    )).rejects.toBe(providerError);
  });
});
