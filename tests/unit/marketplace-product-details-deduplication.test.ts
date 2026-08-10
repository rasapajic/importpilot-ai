import { describe, expect, it } from "vitest";

import {
  marketplaceDetailsEvidenceText,
  supplierOfferMarketplaceDetailsSchema,
} from "../../modules/product-search/domain/marketplace-product-details";

describe("marketplace product details deduplication", () => {
  it("deduplicates aliases and keeps the stronger source value", () => {
    const details = supplierOfferMarketplaceDetailsSchema.parse({
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [],
      attributes: [
        { name: "Name", value: "misting system mist cooling system fog machine" },
        { name: "Product Name", value: "Misting System" },
        { name: "Certificate", value: "CE" },
        { name: "Certification", value: "CE Certificate" },
        { name: "Keyword", value: "High Pressure Fogger" },
        { name: "Keywords", value: "Misting System, High Pressure Fogger" },
        { name: "Customizable", value: "Available" },
      ],
      variants: [],
      packaging: null,
    });

    expect(details.attributes).toEqual([
      {
        name: "Product Name",
        value: "Misting System",
        category: "PRODUCT_SPECIFICATION",
      },
      {
        name: "Certification",
        value: "CE, CE Certificate",
        category: "PRODUCT_SPECIFICATION",
      },
      {
        name: "Keywords",
        value: "High Pressure Fogger, Misting System",
        category: "PRODUCT_SPECIFICATION",
      },
      {
        name: "Customization",
        value: "Available",
        category: "SUPPLIER_COMMERCIAL",
      },
    ]);
  });

  it("promotes unit lists to real variants and removes them from duplicate TAJA evidence", () => {
    const details = supplierOfferMarketplaceDetailsSchema.parse({
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      priceTiers: [],
      attributes: [
        { name: "Flow", value: "0.1mm 0.2mm 0.3mm 0.4mm 0.5mm" },
        { name: "Voltage", value: "110V/220V/380V" },
        { name: "Production Capacity", value: "5,000 Units Per Year" },
      ],
      variants: [],
      packaging: null,
    });

    expect(details.variants).toEqual([
      {
        name: "Flow",
        values: ["0.1 mm", "0.2 mm", "0.3 mm", "0.4 mm", "0.5 mm"],
      },
      {
        name: "Voltage",
        values: ["110 V", "220 V", "380 V"],
      },
    ]);
    expect(details.attributes).toContainEqual({
      name: "Production Capacity",
      value: "5,000 Units Per Year",
      category: "SUPPLIER_COMMERCIAL",
    });
    expect(marketplaceDetailsEvidenceText("Misting system", details))
      .not.toContain("Production Capacity");
  });
});
