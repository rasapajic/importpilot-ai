import { describe, expect, it, vi } from "vitest";

import type { SupplierOfferUrlImportProvider } from "../../modules/product-search/domain/search";
import {
  createDetailedSupplierOfferUrlImportProvider,
  normalizeExternalSupplierName,
} from "../../modules/product-search/infrastructure/detailed-url-import-provider";

const productUrl = "https://mistingsystem.en.made-in-china.com/product/example/China-Misting-Nozzles.html";

function externalPreview() {
  return {
    preview: {
      productTitle: "Misting System Kit with Pump and 20 Nozzles",
      supplierName: "Ningbo Misting Factory",
      supplierCountry: "CN",
      price: "0.85",
      currency: "USD",
      minimumOrderQuantity: "100",
      incoterm: "FOB",
      productUrl,
      imageUrl: "https://image.made-in-china.com/misting.jpg",
      details: {
        adapter: "made-in-china-product-page-v1",
        evidence: "PRODUCT_PAGE",
        priceTiers: [
          { price: "0.85", currency: "USD", minQuantity: 100, maxQuantity: 999 },
          { price: "0.70", currency: "USD", minQuantity: 1_000, maxQuantity: 9_999 },
          { price: "0.65", currency: "USD", minQuantity: 10_000, maxQuantity: null },
        ],
        attributes: [
          { name: "Kit Contents", value: "Pump and 20 brass misting nozzles" },
        ],
        variants: [
          { name: "Nozzle Diameter", values: ["0.1 mm", "0.2 mm"] },
        ],
        packaging: {
          sellingUnit: "Set",
          packageType: "Carton",
          packageLengthCm: 40,
          packageWidthCm: 30,
          packageHeightCm: 20,
          grossWeightKg: 8,
          piecesPerCarton: 1,
        },
      },
    },
  };
}

describe("detailed URL import provider", () => {
  it("preserves structured details and selects the tier for requested quantity", async () => {
    const fetcher = vi.fn(async () => Response.json(externalPreview()));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "secret",
      requestedQuantity: 1_500,
      fetcher: fetcher as typeof fetch,
    });

    const preview = await provider.previewSupplierOfferUrl(productUrl);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(preview).toMatchObject({
      title: "Misting System Kit with Pump and 20 Nozzles",
      supplierName: "Ningbo Misting Factory",
      price: 0.7,
      currency: "USD",
      minimumOrderQuantity: 100,
      details: {
        adapter: "made-in-china-product-page-v1",
        evidence: "PRODUCT_PAGE",
        priceTiers: [
          { price: 0.85, minQuantity: 100, maxQuantity: 999 },
          { price: 0.7, minQuantity: 1_000, maxQuantity: 9_999 },
          { price: 0.65, minQuantity: 10_000, maxQuantity: null },
        ],
        packaging: {
          grossWeightKg: 8,
          piecesPerCarton: 1,
        },
      },
    });
  });

  it("extracts only the legal company from supplier-profile prose", () => {
    expect(normalizeExternalSupplierName(
      "Located in Ningbo, a major port city in Zhejiang Province, Ningbo Lisen Spray Technology Equipment Co., Ltd. supplies misting systems worldwide.",
    )).toBe("Ningbo Lisen Spray Technology Equipment Co., Ltd.");
  });

  it("drops descriptive supplier prose when no legal company is present", () => {
    expect(normalizeExternalSupplierName(
      "Located in Ningbo, a major port city in Zhejiang Province and specializing in outdoor cooling products.",
    )).toBeNull();
  });

  it("preserves the exact supplier identity when the provider returns Corp.Ltd. without spaces", async () => {
    expect(normalizeExternalSupplierName("Pilot Optics International Corp.Ltd."))
      .toBe("Pilot Optics International Corp. Ltd.");
    expect(normalizeExternalSupplierName("Pilot Optics International Corp.Ltd.Wenzhou"))
      .toBe("Pilot Optics International Corp. Ltd");
    expect(normalizeExternalSupplierName(
      "Pilot Optics established in 1999, is a prominent manufacturer",
    )).toBeNull();

    const payload = externalPreview();
    payload.preview.supplierName = "Pilot Optics International Corp.Ltd.";
    const fetcher = vi.fn(async () => Response.json(payload));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      fetcher: fetcher as typeof fetch,
    });
    await expect(provider.previewSupplierOfferUrl(productUrl)).resolves.toMatchObject({
      supplierName: "Pilot Optics International Corp. Ltd.",
    });
  });

  it("rejects an advertised-profile manufacturer phrase as a seller name", () => {
    expect(normalizeExternalSupplierName(
      "Pilot Optics established in 1999, is a prominent manufacturer",
    )).toBeNull();
    expect(normalizeExternalSupplierName(
      "Pilot Optics International Corp. Ltd. is a leading manufacturer in Wenzhou",
    )).toBe("Pilot Optics International Corp. Ltd.");
  });

  it("sanitizes a supplier profile sentence before returning the preview", async () => {
    const payload = externalPreview();
    payload.preview.supplierName =
      "Located in Ningbo, a major port city in Zhejiang Province, Ningbo Lisen Spray Technology Equipment Co., Ltd. supplies misting systems worldwide.";
    const fetcher = vi.fn(async () => Response.json(payload));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      fetcher: fetcher as typeof fetch,
    });

    await expect(provider.previewSupplierOfferUrl(productUrl)).resolves.toMatchObject({
      supplierName: "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
    });
  });

  it("keeps source-attested ranges in preview only, without overriding tier price", async () => {
    const base = externalPreview().preview;
    const payload = { preview: {
      ...base,
      advertisedPriceRange: {
        lowPrice: "0.50", highPrice: "2.00", currency: "USD",
        unit: "Piece", evidence: "EXACT_PRODUCT_JSONLD", sourceUrl: productUrl,
      },
    } };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(payload));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "secret",
      requestedQuantity: 1_500,
      fetcher: fetcher as typeof fetch,
    });
    const preview = await provider.previewSupplierOfferUrl(productUrl);
    expect(preview.price).toBe(0.70);
    expect(preview.advertisedPriceRange).toMatchObject({
      lowPrice: 0.50, highPrice: 2, currency: "USD", sourceUrl: productUrl,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer secret" },
    });
  });

  it("fails closed for range evidence linked to another SKU or currency", async () => {
    for (const evidence of [
      { lowPrice: "0.50", highPrice: "2.00", currency: "USD",
        unit: "Piece", evidence: "EXACT_PRODUCT_JSONLD", sourceUrl: productUrl + "?otherSku=true" },
      { lowPrice: "0.50", highPrice: "2.00", currency: "EUR",
        unit: "Piece", evidence: "EXACT_PRODUCT_JSONLD", sourceUrl: productUrl },
    ]) {
      const fetcher = vi.fn(async () => Response.json({
        preview: { ...externalPreview().preview, advertisedPriceRange: evidence },
      }));
      const provider = createDetailedSupplierOfferUrlImportProvider({
        endpoint: "https://url-import.example/preview",
        fetcher: fetcher as typeof fetch,
      });
      const preview = await provider.previewSupplierOfferUrl(productUrl);
      expect(preview.advertisedPriceRange).toBeNull();
      expect(preview.minimumOrderQuantity).toBe(100);
    }
  });

  it("normalizes a verified video range from the same SKU and preserves a public-only quote status", async () => {
    const pilot = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    const video = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    const payload = {
      preview: {
        productTitle: "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses",
        supplierName: "Pilot Optics International Corp.Ltd.",
        price: "0.50",
        currency: "USD",
        minimumOrderQuantity: "1200",
        productUrl: pilot,
        imageUrl: null,
        details: null,
        advertisedPriceRange: {
          lowPrice: "0.50", highPrice: "2.00", currency: "USD",
          unit: "Piece", evidence: "MATCHED_VIDEO_CHANNEL",
          sourceUrl: pilot, evidenceUrl: video,
        },
      },
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(payload));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "secret",
      fetcher: fetcher as typeof fetch,
    });
    const result = await provider.previewSupplierOfferUrl(pilot);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.minimumOrderQuantity).toBe(1200);
    expect(result.price).toBe(0.50);
    expect(result.supplierName).toBe("Pilot Optics International Corp. Ltd.");
    expect(result.advertisedPriceRange).toMatchObject({
      lowPrice: 0.50, highPrice: 2, evidenceUrl: video, evidence: "MATCHED_VIDEO_CHANNEL",
    });
  });

  it("uses the supplied fallback provider when no endpoint is configured", async () => {
    const fallback: SupplierOfferUrlImportProvider = {
      previewSupplierOfferUrl: vi.fn(async () => ({
        title: "Fallback product",
        supplierName: null,
        supplierCountry: null,
        price: null,
        currency: null,
        minimumOrderQuantity: null,
        incoterm: null,
        productUrl,
        imageUrl: null,
        source: "made-in-china.com",
        details: null,
        isPartial: true,
        titleFromSlug: false,
      })),
    };
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: null,
      fallbackProvider: fallback,
    });

    await expect(provider.previewSupplierOfferUrl(productUrl)).resolves.toMatchObject({
      title: "Fallback product",
    });
    expect(fallback.previewSupplierOfferUrl).toHaveBeenCalledTimes(1);
  });
});
