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
  it("recognizes only genuine HTTPS 1688 offer-detail URLs", () => {
    expect(is1688Url("https://detail.1688.com/offer/123456.html")).toBe(true);
    expect(is1688Url("https://m.1688.com/offer/123456.htm?spm=tracking")).toBe(true);
    expect(is1688Url("https://s.1688.com/selloffer/offer_search.htm?keywords=fan")).toBe(false);
    expect(is1688Url("https://www.1688.com/")).toBe(false);
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
    expect(createBrowserAssisted1688Preview(
      "https://s.1688.com/selloffer/offer_search.htm?keywords=fan",
    )).toBeNull();
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
      supplierLogistics: null,
      provenance: {
        originalQuery: "oprema za plastenike",
        targetCountry: "RS",
        quantity: 100,
      },
    });
  });

  it("persists 1688 logistics evidence next to source provenance", () => {
    const metadata = createSupplierOfferSourceMetadata(result({
      productUrl: "https://detail.1688.com/offer/123456.html",
      source: "TAJA 1688",
      incoterm: null,
      supplierLogistics: {
        grossWeightKg: 12,
        netWeightKg: null,
        cartonLengthCm: 60,
        cartonWidthCm: 40,
        cartonHeightCm: 35,
        piecesPerCarton: 20,
        unitWeightKg: null,
        unitVolumeCbm: null,
        evidence: "PRODUCT_PAGE",
      },
    }), new Date("2026-08-04T08:30:00.000Z"));

    expect(metadata).toMatchObject({
      sourceHost: "detail.1688.com",
      supplierLogistics: {
        grossWeightKg: 12,
        piecesPerCarton: 20,
        evidence: "PRODUCT_PAGE",
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
