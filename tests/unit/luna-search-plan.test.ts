import { describe, expect, it } from "vitest";

import {
  applyLunaSearchConstraints,
  createLunaSearchPlan,
  isPartialLunaSearchResult,
} from "../../modules/product-search/domain/luna-search-plan";
import type {
  ProjectSupplierSearchRequest,
  SupplierOfferSearchResult,
} from "../../modules/product-search/domain/search";

const baseRequest: ProjectSupplierSearchRequest = {
  query: "kompletna oprema za plastenike",
  quantity: 100,
  targetCountry: "RS",
  avoidComplexCompliance: true,
  privateLabel: false,
};

function result(overrides: Partial<SupplierOfferSearchResult> = {}): SupplierOfferSearchResult {
  return {
    title: "Greenhouse accessory kit",
    supplierName: "Example Supplier",
    supplierCountry: "CN",
    price: 10,
    currency: "EUR",
    minimumOrderQuantity: 50,
    incoterm: "FOB",
    productUrl: "https://provider.example/greenhouse-kit",
    imageUrl: null,
    source: "provider-example",
    ...overrides,
  };
}

describe("Luna Search plan", () => {
  it("prepares English and Chinese queries for a known Serbian category", () => {
    const plan = createLunaSearchPlan({
      ...baseRequest,
      privateLabel: true,
    });

    expect(plan.category).toBe("greenhouse-equipment");
    expect(plan.providerQuery).toContain("greenhouse equipment and accessories");
    expect(plan.providerQuery).toContain("OEM private label");
    expect(plan.chinese1688Query).toContain("温室大棚全套设备");
    expect(plan.chinese1688Query).toContain("OEM 贴牌");
    expect(plan.warnings.some((warning) => warning.includes("Sertifikacioni rizik"))).toBe(true);
  });

  it("does not invent a Chinese translation for an unknown product", () => {
    const plan = createLunaSearchPlan({
      ...baseRequest,
      query: "specijalni proizvod bez kataloškog prevoda",
    });

    expect(plan.providerQuery).toBe("specijalni proizvod bez kataloškog prevoda");
    expect(plan.chinese1688Query).toBeNull();
    expect(plan.warnings.some((warning) => warning.includes("Kineski upit"))).toBe(true);
  });

  it("applies only comparable price and known MOQ constraints", () => {
    const request: ProjectSupplierSearchRequest = {
      ...baseRequest,
      maxUnitPrice: 12,
      maxUnitPriceCurrency: "EUR",
      maxMoq: 100,
    };
    const results = [
      result(),
      result({
        productUrl: "https://provider.example/expensive",
        price: 15,
      }),
      result({
        productUrl: "https://provider.example/high-moq",
        minimumOrderQuantity: 250,
      }),
      result({
        productUrl: "https://provider.example/usd-price",
        price: 20,
        currency: "USD",
      }),
      result({
        productUrl: "https://provider.example/unknown-price",
        price: null,
        currency: null,
      }),
    ];

    expect(applyLunaSearchConstraints(results, request).map((item) => item.productUrl)).toEqual([
      "https://provider.example/greenhouse-kit",
      "https://provider.example/usd-price",
      "https://provider.example/unknown-price",
    ]);
  });

  it("marks results with missing commercial facts as partial", () => {
    expect(isPartialLunaSearchResult(result())).toBe(false);
    expect(isPartialLunaSearchResult(result({ incoterm: null }))).toBe(true);
    expect(isPartialLunaSearchResult(result({ minimumOrderQuantity: null }))).toBe(true);
  });
});
