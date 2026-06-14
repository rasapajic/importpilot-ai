import { describe, expect, it } from "vitest";

import {
  normalizeSupplierSearchQuery,
  supplierSearchCacheSource,
} from "../../modules/product-search/infrastructure/persistent-cache";

const result = {
  title: "USB-C Phone Charger",
  supplierName: "Shenzhen Charger Supplier",
  supplierCountry: "CN",
  price: 3.5,
  currency: "USD",
  minimumOrderQuantity: 100,
  incoterm: "FOB",
  productUrl: "https://charger.en.made-in-china.com/product/usb-c-charger.html",
  imageUrl: null,
  source: "Made-in-China",
};

describe("supplier search persistent cache", () => {
  it("normalizes equivalent search queries to the same cache key", () => {
    expect(normalizeSupplierSearchQuery("  Punjač za TELEFON, Type-C! ")).toBe(
      "punjac za telefon type c",
    );
  });

  it("stores deterministic provider source labels", () => {
    expect(supplierSearchCacheSource([
      result,
      { ...result, source: "Alibaba" },
      result,
    ])).toBe("Alibaba, Made-in-China");
  });
});
