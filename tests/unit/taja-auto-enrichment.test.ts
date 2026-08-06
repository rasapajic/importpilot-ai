import { describe, expect, it, vi } from "vitest";

import {
  autoEnrichTajaCandidates,
  TajaAutoEnrichmentStatuses,
} from "../../modules/product-search/application/taja-auto-enrichment";
import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlImportProvider,
} from "../../modules/product-search/domain/search";

function result(
  productUrl: string,
  overrides: Partial<SupplierOfferSearchResult> = {},
): SupplierOfferSearchResult {
  return {
    title: "Industrial fan",
    supplierName: "Search Supplier",
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "TAJA web",
    ...overrides,
  };
}

function previewProvider(
  implementation: SupplierOfferUrlImportProvider["previewSupplierOfferUrl"],
): SupplierOfferUrlImportProvider {
  return { previewSupplierOfferUrl: implementation };
}

describe("TAJA finalist auto-enrichment", () => {
  it("fills only missing fields from supported direct supplier pages", async () => {
    const productUrl = "https://www.alibaba.com/product-detail/fan_123456.html";
    const provider = previewProvider(vi.fn(async () => ({
      title: "Parsed fan",
      supplierName: "Parsed Supplier",
      supplierCountry: "CN",
      price: 12,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      productUrl,
      imageUrl: "https://example.com/fan.jpg",
      source: "alibaba.com",
      isPartial: false,
      titleFromSlug: false,
    })));

    const outcome = await autoEnrichTajaCandidates([result(productUrl)], provider);

    expect(outcome.results[0]).toMatchObject({
      title: "Industrial fan",
      supplierName: "Search Supplier",
      supplierCountry: "CN",
      price: 12,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      imageUrl: "https://example.com/fan.jpg",
    });
    expect(outcome.summary).toMatchObject({
      attemptedCandidates: 1,
      enrichedCandidates: 1,
      failedCandidates: 0,
    });
    expect(outcome.summary.reports[0]).toMatchObject({
      status: TajaAutoEnrichmentStatuses.ENRICHED,
      fieldsFilled: expect.arrayContaining([
        "supplierCountry",
        "price",
        "minimumOrderQuantity",
        "incoterm",
        "imageUrl",
      ]),
    });
  });

  it("isolates provider failures and skips unsupported or over-limit candidates", async () => {
    const failingUrl = "https://fan.en.made-in-china.com/product/fan_ABC123.html";
    const unsupportedUrl = "https://manufacturer.example/products/fan";
    const overLimitUrl = "https://www.alibaba.com/product-detail/other_987654.html";
    const provider = previewProvider(vi.fn(async () => {
      throw new Error("upstream secret details");
    }));

    const outcome = await autoEnrichTajaCandidates([
      result(failingUrl),
      result(unsupportedUrl),
      result(overLimitUrl),
    ], provider, { maxCandidates: 2, concurrency: 2 });

    expect(outcome.results).toHaveLength(3);
    expect(outcome.summary).toMatchObject({
      attemptedCandidates: 1,
      failedCandidates: 1,
      skippedUnsupportedCandidates: 1,
      skippedByLimitCandidates: 1,
    });
    expect(outcome.summary.reports.map((report) => report.status)).toEqual([
      TajaAutoEnrichmentStatuses.FAILED,
      TajaAutoEnrichmentStatuses.SKIPPED_UNSUPPORTED,
      TajaAutoEnrichmentStatuses.SKIPPED_LIMIT,
    ]);
    expect(outcome.summary.reports[0]?.failureCode).toBe("Error");
    expect(JSON.stringify(outcome.summary)).not.toContain("upstream secret details");
  });

  it("preserves already known commercial fields", async () => {
    const productUrl = "https://www.alibaba.com/product-detail/fan_123456.html";
    const provider = previewProvider(async () => ({
      title: "Parsed fan",
      supplierName: "Parsed Supplier",
      supplierCountry: "CN",
      price: 1,
      currency: "USD",
      minimumOrderQuantity: 1,
      incoterm: "EXW",
      productUrl,
      imageUrl: null,
      source: "alibaba.com",
      isPartial: true,
      titleFromSlug: false,
    }));

    const outcome = await autoEnrichTajaCandidates([
      result(productUrl, {
        supplierCountry: "CN",
        price: 20,
        currency: "EUR",
        minimumOrderQuantity: 250,
        incoterm: "FOB",
      }),
    ], provider);

    expect(outcome.results[0]).toMatchObject({
      price: 20,
      currency: "EUR",
      minimumOrderQuantity: 250,
      incoterm: "FOB",
    });
    expect(outcome.summary.reports[0]?.status)
      .toBe(TajaAutoEnrichmentStatuses.UNCHANGED);
  });

  it("does not fetch a candidate whose enrichable fields are already complete", async () => {
    const productUrl = "https://www.alibaba.com/product-detail/fan_123456.html";
    const preview = vi.fn(async () => {
      throw new Error("must not be called");
    });
    const provider = previewProvider(preview);

    const outcome = await autoEnrichTajaCandidates([
      result(productUrl, {
        supplierCountry: "CN",
        price: 20,
        currency: "EUR",
        minimumOrderQuantity: 250,
        incoterm: "FOB",
        imageUrl: "https://example.com/fan.jpg",
      }),
    ], provider);

    expect(preview).not.toHaveBeenCalled();
    expect(outcome.summary).toMatchObject({
      attemptedCandidates: 0,
      unchangedCandidates: 1,
    });
    expect(outcome.summary.reports[0]?.status)
      .toBe(TajaAutoEnrichmentStatuses.UNCHANGED);
  });
});
