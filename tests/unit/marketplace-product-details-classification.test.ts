import { describe, expect, it } from "vitest";

import {
  marketplaceDetailsEvidenceText,
  marketplaceDetailsToSupplierLogistics,
  supplierOfferMarketplaceDetailsSchema,
} from "../../modules/product-search/domain/marketplace-product-details";

function parseDetails(input: {
  attributes?: Array<{ name: string; value: string }>;
  variants?: Array<{ name: string; values: string[] }>;
  packaging?: Record<string, unknown> | null;
}) {
  return supplierOfferMarketplaceDetailsSchema.parse({
    adapter: "made-in-china-product-page-v2",
    evidence: "PRODUCT_PAGE",
    priceTiers: [],
    attributes: input.attributes ?? [],
    variants: input.variants ?? [],
    packaging: input.packaging ?? null,
  });
}

describe("marketplace product details normalization", () => {
  it("separates product, supplier and marketplace facts", () => {
    const details = parseDetails({
      attributes: [
        { name: "Flow", value: "0.1 mm, 0.2 mm" },
        { name: "Production Capacity", value: "5,000 Units Per Year" },
        { name: "Payment Protection", value: "Platform-protected payments" },
        { name: "Unmapped Field", value: "Source value" },
        { name: "Package Size", value: "10.00cm * 10.00cm * 10.00cm" },
      ],
    });

    expect(details.attributes).toEqual([
      { name: "Flow", value: "0.1 mm, 0.2 mm", category: "PRODUCT_SPECIFICATION" },
      { name: "Production Capacity", value: "5,000 Units Per Year", category: "SUPPLIER_COMMERCIAL" },
      { name: "Payment Protection", value: "Platform-protected payments", category: "MARKETPLACE_SERVICE" },
      { name: "Unmapped Field", value: "Source value", category: "OTHER" },
    ]);
  });

  it("keeps only credible selectable variant groups", () => {
    const details = parseDetails({
      variants: [
        { name: "Flow", values: ["0.1 mm", "0.2 mm", "0.3 mm"] },
        { name: "Voltage", values: ["110V", "220V", "380V"] },
        { name: "Production Capacity", values: ["5", "000 Units Per Year"] },
        { name: "Accessory Type", values: ["304 stainless steel", "PA nylon pipe", "brass parts"] },
      ],
    });

    expect(details.variants).toEqual([
      { name: "Flow", values: ["0.1 mm", "0.2 mm", "0.3 mm"] },
      { name: "Voltage", values: ["110V", "220V", "380V"] },
    ]);
  });

  it("does not expose supplier or marketplace text to TAJA requirement matching", () => {
    const details = parseDetails({
      attributes: [
        { name: "Payment Protection", value: "Pump and 20 nozzles are protected" },
        { name: "Production Capacity", value: "Patio systems and pumps" },
        { name: "Application", value: "Outdoor patio and terrace" },
      ],
    });

    expect(marketplaceDetailsEvidenceText("Misting system", details)).toBe(
      "Misting system · Application: Outdoor patio and terrace",
    );
  });

  it("blocks ambiguous and physically implausible packaging from landed cost", () => {
    const details = parseDetails({
      packaging: {
        sellingUnit: null,
        packageType: null,
        packageLengthCm: 10,
        packageWidthCm: 10,
        packageHeightCm: 10,
        grossWeightKg: 10,
        piecesPerCarton: null,
      },
    });

    expect(details.packaging).toMatchObject({
      scope: "UNKNOWN",
      confidence: "LOW",
      usableForLandedCost: false,
      validationNote: "Package dimensions and weight produce an implausible packaged density.",
    });
    expect(marketplaceDetailsToSupplierLogistics(details)).toBeNull();
  });

  it("accepts complete selling-unit packaging and derives logistics", () => {
    const details = parseDetails({
      packaging: {
        sellingUnit: "Set",
        packageType: "Carton",
        packageLengthCm: 40,
        packageWidthCm: 30,
        packageHeightCm: 20,
        grossWeightKg: 8,
        piecesPerCarton: null,
      },
    });

    expect(details.packaging).toMatchObject({
      scope: "SELLING_UNIT",
      confidence: "MEDIUM",
      usableForLandedCost: true,
      validationNote: null,
    });
    expect(marketplaceDetailsToSupplierLogistics(details)).toMatchObject({
      grossWeightKg: 8,
      cartonLengthCm: 40,
      cartonWidthCm: 30,
      cartonHeightCm: 20,
      piecesPerCarton: 1,
      evidence: "PRODUCT_PAGE",
    });
  });
});
