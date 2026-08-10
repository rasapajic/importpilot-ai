import { describe, expect, it } from "vitest";

import { createSupplierOfferSourceMetadata } from "../../modules/product-search/domain/source-provenance";
import type { SupplierOfferSearchResult } from "../../modules/product-search/domain/search";

describe("marketplace details provenance", () => {
  it("stores exact-page specifications, tiers and packaging with the offer", () => {
    const result: SupplierOfferSearchResult = {
      title: "Patio misting system",
      supplierName: "Example Supplier",
      supplierCountry: "CN",
      price: 12,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      productUrl: "https://example.en.made-in-china.com/product/abc/China-Patio-Misting-System.html",
      imageUrl: null,
      source: "made-in-china-v1",
      marketplaceDetails: {
        adapter: "made-in-china-product-page-v1",
        evidence: "PRODUCT_PAGE",
        priceTiers: [
          { price: 12, currency: "USD", minQuantity: 100, maxQuantity: 499 },
        ],
        attributes: [
          { name: "Kit Contents", value: "Pump and 20 nozzles" },
        ],
        variants: [],
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
      supplierLogistics: {
        grossWeightKg: 8,
        netWeightKg: null,
        cartonLengthCm: 40,
        cartonWidthCm: 30,
        cartonHeightCm: 20,
        piecesPerCarton: 1,
        unitWeightKg: null,
        unitVolumeCbm: null,
        evidence: "PRODUCT_PAGE",
      },
    };

    expect(createSupplierOfferSourceMetadata(result)).toMatchObject({
      marketplaceDetails: {
        adapter: "made-in-china-product-page-v1",
        evidence: "PRODUCT_PAGE",
        attributes: [
          { name: "Kit Contents", value: "Pump and 20 nozzles" },
        ],
      },
      supplierLogistics: {
        grossWeightKg: 8,
        piecesPerCarton: 1,
        evidence: "PRODUCT_PAGE",
      },
    });
  });
});
