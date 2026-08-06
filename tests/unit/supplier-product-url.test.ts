import { describe, expect, it } from "vitest";

import { canonicalSupplierProductUrl } from "../../modules/product-search/domain/supplier-product-url";

describe("supplier product URL canonicalization", () => {
  it("removes tracking parameters and fragments", () => {
    expect(canonicalSupplierProductUrl(
      "https://www.Supplier.Example/product/fan/?utm_source=taja&spm=123&variant=blue#details",
    )).toBe("https://supplier.example/product/fan?variant=blue");
  });

  it("keeps meaningful query parameters in stable order", () => {
    expect(canonicalSupplierProductUrl(
      "https://supplier.example/product?id=20&color=red",
    )).toBe("https://supplier.example/product?color=red&id=20");
  });

  it("normalizes invalid fallback values without throwing", () => {
    expect(canonicalSupplierProductUrl("  NOT A URL  ")).toBe("not a url");
  });
});
