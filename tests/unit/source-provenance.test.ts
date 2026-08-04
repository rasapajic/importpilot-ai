import { describe, expect, it } from "vitest";

import {
  createBrowserAssisted1688Preview,
  createSupplierOfferSourceMetadata,
  is1688Url,
} from "../../modules/product-search/domain/source-provenance";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

function result(overrides: Partial<SupplierOfferSearchResult> = {}): SupplierOfferSearchResult {
  return {
    title: "Greenhouse equipment kit",
    supplierName: "Example Supplier",
    supplierCountry: "CN",
    price: 12,
    currency: "EUR",
    minimumOrderQuantity: 50,
    incoterm: "FOB",
    productUrl: "https://www.alibaba.com/product-detail/example_123456.html",
    imageUrl: null,
    source: "alibaba",
    ...overrides,
  };
}

describe("supplier offer source provenance", () => {
  it("recognizes only genuine HTTPS 1688 hosts", () => {
    expect(is1688Url("https://detail.1688.com/offer/123456.html")).toBe(true);
    expect(is1688Url("https://m.1688.com/offer/123456.html")).toBe(true);
    expect(is1688Url("http://detail.1688.com/offer/123456.html")).toBe(false);
    expect(is1688Url("https://fake1688.com/offer/123456.html")).toBe(false);
  });

  it("creates a partial browser-assisted preview without fetching a protected 1688 session", () => {
    const preview = createBrowserAssisted1688Preview(
      "https://detail.1688.com/offer/123456.html",
    );

    expect(preview).toMatchObject({
      title: null,
      supplierName: null,
      productUrl: "https://detail.1688.com/offer/123456.html",
      source: "detail.1688.com",
      isPartial: true,
    });
  });

  it("preserves Luna live-search provenance in saved offer metadata", () => {
    const metadata = createSupplierOfferSourceMetadata(result({
      provenance: {
        fetchedAt: "2026-08-04T08:00:00.000Z",
        resultOrigin: "live",
        originalQuery: "oprema za plastenike",
        providerQuery: "greenhouse equipment and accessories",
        chinese1688Query: "温室大棚全套设备 厂家 批发",
        targetCountry: "RS",
        quantity: 100,
      },
    }));

    expect(metadata).toMatchObject({
      sourceHost: "www.alibaba.com",
      fetchedAt: "2026-08-04T08:00:00.000Z",
      resultOrigin: "live",
      captureMode: "LUNA_SEARCH",
      dataStatus: "COMPLETE",
      provenance: {
        originalQuery: "oprema za plastenike",
        targetCountry: "RS",
        quantity: 100,
      },
    });
  });

  it("adds honest fallback provenance for manually reviewed 1688 data", () => {
    const metadata = createSupplierOfferSourceMetadata(result({
      productUrl: "https://detail.1688.com/offer/123456.html",
      source: "detail.1688.com",
      incoterm: null,
    }), new Date("2026-08-04T08:30:00.000Z"));

    expect(metadata).toMatchObject({
      sourceHost: "detail.1688.com",
      fetchedAt: "2026-08-04T08:30:00.000Z",
      resultOrigin: "browser-assisted-1688",
      captureMode: "BROWSER_ASSISTED_1688",
      dataStatus: "PARTIAL",
    });
  });
});
