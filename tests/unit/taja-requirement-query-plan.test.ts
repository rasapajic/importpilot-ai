import { describe, expect, it } from "vitest";

import {
  buildLunaProviderSearchInput,
  createLunaSearchPlan,
} from "../../modules/product-search/domain/luna-search-plan";
import type { ProjectSupplierSearchRequest } from "../../modules/product-search/domain/search";

const request: ProjectSupplierSearchRequest = {
  query: "Vodena magla za terasu sa pumpom i 20 mlaznica",
  quantity: 100,
  targetCountry: "AT",
  strictPriceLimit: false,
  avoidComplexCompliance: true,
  privateLabel: false,
};

describe("TAJA requirement-driven query plan", () => {
  it("creates exact English and Chinese queries before broader fallbacks", () => {
    const plan = createLunaSearchPlan(request);

    expect(plan.category).toBe("misting-system");
    expect(plan.providerQueries).toEqual([
      "patio misting system with pump 20 nozzles",
      "outdoor mist cooling kit pump 20 nozzles",
      "terrace misting system 20 nozzles pump kit",
      "patio misting cooling system",
    ]);
    expect(plan.chinese1688Queries).toEqual([
      "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
      "户外 喷雾套装 水泵 20喷头 厂家 批发",
      "庭院 喷雾降温 20个喷嘴 水泵 厂家 批发",
      "喷雾降温系统 厂家 批发",
    ]);
    expect(plan.providerQuery).toBe(plan.providerQueries[0]);
    expect(plan.chinese1688Query).toBe(plan.chinese1688Queries[0]);
  });

  it("passes every bounded variant to the supplier-search service", () => {
    const plan = createLunaSearchPlan(request);
    const providerInput = buildLunaProviderSearchInput(plan, request);

    expect(providerInput).toEqual({
      query: "patio misting system with pump 20 nozzles",
      queryVariants: plan.providerQueries,
      chinese1688QueryVariants: plan.chinese1688Queries,
      quantity: 100,
      targetCountry: "AT",
    });
  });
});
