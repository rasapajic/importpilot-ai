import { describe, expect, it, vi } from "vitest";

import type { SupplierOfferUrlImportProvider } from "../../modules/product-search/domain/search";
import {
  createFinalistUrlEnrichmentProvider,
  TajaFinalistEnrichmentLimitError,
} from "../../modules/product-search/infrastructure/finalist-url-enrichment-provider";

function preview(productUrl: string) {
  return {
    title: "Test product",
    supplierName: "Test Supplier Co., Ltd.",
    supplierCountry: "CN",
    price: 10,
    currency: "USD",
    minimumOrderQuantity: 1,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "made-in-china.com",
    details: null,
    isPartial: false,
    titleFromSlug: false,
  } as const;
}

describe("createFinalistUrlEnrichmentProvider", () => {
  it("allows only the configured top finalists through", async () => {
    const base: SupplierOfferUrlImportProvider = {
      previewSupplierOfferUrl: vi.fn(async (productUrl: string) => preview(productUrl)),
    };
    const provider = createFinalistUrlEnrichmentProvider(base, 3);
    const urls = [1, 2, 3, 4, 5].map(
      (index) => `https://supplier.en.made-in-china.com/product/${index}/China-Test-${index}.html`,
    );

    const outcomes = await Promise.allSettled(
      urls.map((url) => provider.previewSupplierOfferUrl(url)),
    );

    expect(base.previewSupplierOfferUrl).toHaveBeenCalledTimes(3);
    expect(outcomes.slice(0, 3).every((outcome) => outcome.status === "fulfilled"))
      .toBe(true);
    expect(outcomes.slice(3).every(
      (outcome) => outcome.status === "rejected" &&
        outcome.reason instanceof TajaFinalistEnrichmentLimitError,
    )).toBe(true);
  });

  it("can disable exact-page enrichment with a zero limit", async () => {
    const base: SupplierOfferUrlImportProvider = {
      previewSupplierOfferUrl: vi.fn(async (productUrl: string) => preview(productUrl)),
    };
    const provider = createFinalistUrlEnrichmentProvider(base, 0);

    await expect(provider.previewSupplierOfferUrl(
      "https://supplier.en.made-in-china.com/product/1/China-Test.html",
    )).rejects.toBeInstanceOf(TajaFinalistEnrichmentLimitError);
    expect(base.previewSupplierOfferUrl).not.toHaveBeenCalled();
  });
});
