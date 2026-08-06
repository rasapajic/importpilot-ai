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

const summary = {
  mode: "deep-search-phase1" as const,
  configuredSources: 4,
  successfulSources: 3,
  parsedResults: 42,
  relevantCandidates: 30,
  duplicateResultsRemoved: 7,
  unprocessedCandidates: 0,
  returnedResults: 23,
  sourceResultCounts: {
    "openai-web-search-v1": 10,
    "openai-1688-web-v1": 8,
    "alibaba-v1": 5,
    "made-in-china-v1": 7,
  },
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

  it("passes a validated deep-search summary with live results", async () => {
    const outcome = await searchSupplierOffersWithPersistentFallback(
      input,
      {
        searchSupplierOffers: vi.fn().mockResolvedValue({
          results: [result],
          summary,
        }),
      },
      { store: vi.fn().mockResolvedValue({}), find: vi.fn() },
    );

    expect(outcome).toMatchObject({
      results: [result],
      summary,
      resultOrigin: "live",
      liveProviderFailed: false,
    });
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
    expect(outcome).not.toHaveProperty("summary");
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
