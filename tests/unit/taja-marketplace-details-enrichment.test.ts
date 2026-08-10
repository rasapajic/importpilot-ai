import { describe, expect, it } from "vitest";

import {
  autoEnrichTajaCandidates,
  TajaAutoEnrichmentStatuses,
} from "../../modules/product-search/application/taja-auto-enrichment";
import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlImportProvider,
} from "../../modules/product-search/domain/search";

const productUrl = "https://mistingsystem.en.made-in-china.com/product/example/China-Misting-System.html";

function candidate(): SupplierOfferSearchResult {
  return {
    title: "Misting system",
    supplierName: "Example Supplier",
    supplierCountry: "CN",
    price: 0.65,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "made-in-china-v1",
  };
}

describe("TAJA marketplace details enrichment", () => {
  it("persists exact-page details and derives supplier logistics", async () => {
    const provider: SupplierOfferUrlImportProvider = {
      previewSupplierOfferUrl: async () => ({
        title: "Misting system",
        supplierName: "Example Supplier",
        supplierCountry: "CN",
        price: 0.85,
        currency: "USD",
        minimumOrderQuantity: 100,
        incoterm: "FOB",
        productUrl,
        imageUrl: "https://image.made-in-china.com/misting.jpg",
        source: "made-in-china.com",
        details: {
          adapter: "made-in-china-product-page-v2",
          evidence: "PRODUCT_PAGE",
          priceTiers: [
            { price: 0.85, currency: "USD", minQuantity: 100, maxQuantity: 999 },
          ],
          attributes: [
            {
              name: "Kit Contents",
              value: "Pump with 20 brass misting nozzles",
              category: "PRODUCT_SPECIFICATION",
            },
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
            scope: "CARTON",
            confidence: "HIGH",
            usableForLandedCost: true,
            validationNote: null,
          },
        },
        isPartial: false,
        titleFromSlug: false,
      }),
    };

    const outcome = await autoEnrichTajaCandidates([candidate()], provider);

    expect(outcome.results[0]).toMatchObject({
      price: 0.85,
      imageUrl: "https://image.made-in-china.com/misting.jpg",
      marketplaceDetails: {
        attributes: [
          {
            name: "Kit Contents",
            value: "Pump with 20 brass misting nozzles",
            category: "PRODUCT_SPECIFICATION",
          },
        ],
      },
      supplierLogistics: {
        grossWeightKg: 8,
        cartonLengthCm: 40,
        cartonWidthCm: 30,
        cartonHeightCm: 20,
        piecesPerCarton: 1,
        evidence: "PRODUCT_PAGE",
      },
    });
    expect(outcome.summary.reports[0]).toMatchObject({
      status: TajaAutoEnrichmentStatuses.ENRICHED,
      fieldsFilled: expect.arrayContaining([
        "imageUrl",
        "marketplaceDetails",
        "supplierLogistics",
      ]),
      fieldsCorrected: expect.arrayContaining(["price"]),
    });
  });
});
