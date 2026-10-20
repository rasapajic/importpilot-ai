import { describe, expect, it } from "vitest";

import { withSearchDeadline, SupplierSearchRequestTimeoutError } from "../../modules/product-search/application/search-deadline";
import {
  classifySupplierSearchOutcome,
  supplierSearchConsumesLiveQuota,
} from "../../modules/product-search/domain/search-outcome";
import {
  displayedSupplierPriceEvidence,
  supplierPriceEvidenceLabel,
} from "../../modules/product-search/domain/supplier-price-evidence";

describe("supplier search outcome classification", () => {
  it("keeps a successful provider response distinct from cache and failure", () => {
    expect(classifySupplierSearchOutcome({
      resultOrigin: "live",
      liveProviderFailed: false,
      returnedFromCache: false,
      resultCount: 3,
    })).toEqual({ searchDisposition: "live", failureCode: null });

    expect(classifySupplierSearchOutcome({
      resultOrigin: "cache",
      liveProviderFailed: false,
      returnedFromCache: true,
      resultCount: 3,
    })).toEqual({ searchDisposition: "cache", failureCode: null });

    expect(classifySupplierSearchOutcome({
      resultOrigin: "cache",
      liveProviderFailed: true,
      returnedFromCache: true,
      resultCount: 3,
    })).toEqual({ searchDisposition: "cache", failureCode: "provider_error" });

    expect(classifySupplierSearchOutcome({
      resultOrigin: null,
      liveProviderFailed: true,
      returnedFromCache: false,
      resultCount: 0,
      failureCode: "timeout",
    })).toEqual({ searchDisposition: "failed", failureCode: "timeout" });

    expect(classifySupplierSearchOutcome({
      resultOrigin: null,
      liveProviderFailed: true,
      returnedFromCache: false,
      resultCount: 0,
    })).toEqual({ searchDisposition: "failed", failureCode: "no_verified_offers" });
  });

  it("charges a live-search credit only for a new live result set", () => {
    expect(supplierSearchConsumesLiveQuota({ searchDisposition: "live" })).toBe(true);
    expect(supplierSearchConsumesLiveQuota({ searchDisposition: "cache" })).toBe(false);
    expect(supplierSearchConsumesLiveQuota({ searchDisposition: "failed" })).toBe(false);
  });
});

describe("supplier price evidence", () => {
  it("does not present a marketplace search price as page-confirmed", () => {
    expect(displayedSupplierPriceEvidence({
      price: 4.5,
      currency: "USD",
    })).toBe("MARKETPLACE_SEARCH");
    expect(displayedSupplierPriceEvidence({
      price: 4.5,
      currency: "USD",
      priceEvidence: "MARKETPLACE_SEARCH",
    })).toBe("MARKETPLACE_SEARCH");
    expect(supplierPriceEvidenceLabel("MARKETPLACE_SEARCH", "sr"))
      .toContain("Nije posebno potvrđeno");
  });

  it("marks only a complete offer-page review as confirmed", () => {
    expect(displayedSupplierPriceEvidence({
      price: 6.16,
      currency: "EUR",
      priceEvidence: "PRODUCT_PAGE",
    })).toBe("PRODUCT_PAGE");
    expect(displayedSupplierPriceEvidence({
      price: null,
      currency: null,
      priceEvidence: "PRODUCT_PAGE",
    })).toBeNull();
    expect(supplierPriceEvidenceLabel("PRODUCT_PAGE", "sr"))
      .toContain("kompletne stranice");
  });
});

describe("supplier search request deadline", () => {
  it("returns offers that arrive when the deadline aborts the provider", async () => {
    const outcome = await withSearchDeadline(
      (signal) => new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          resolve({ results: [{ productUrl: "https://www.alibaba.com/product-detail/fan_1.html" }] });
        }, { once: true });
      }),
      15,
      200,
    );

    expect(outcome).toEqual({
      results: [{ productUrl: "https://www.alibaba.com/product-detail/fan_1.html" }],
    });
  });

  it("fails clearly when aborted work never returns a saved or live result", async () => {
    await expect(withSearchDeadline(
      () => new Promise(() => undefined),
      15,
      20,
    )).rejects.toBeInstanceOf(SupplierSearchRequestTimeoutError);
  });
});
