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
  it("creates exact B2B queries plus one broader English fallback", () => {
    const plan = createLunaSearchPlan(request);

    expect(plan.category).toBe("misting-system");
    expect(plan.providerQueries).toEqual([
      "patio misting system with pump 20 nozzles wholesale manufacturer supplier",
      "outdoor mist cooling kit pump 20 nozzles wholesale manufacturer supplier",
      "terrace misting system 20 nozzles pump kit wholesale manufacturer supplier",
      "patio misting cooling system wholesale manufacturer supplier",
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
      query: "patio misting system with pump 20 nozzles wholesale manufacturer supplier",
      queryVariants: plan.providerQueries,
      chinese1688QueryVariants: plan.chinese1688Queries,
      quantity: 100,
      targetCountry: "AT",
    });
  });
});


describe("food packaging search plan", () => {
  const foodPackagingRequest: ProjectSupplierSearchRequest = {
    query: "Pakovanja za hranu 400ml - 500ml",
    quantity: 10000,
    targetCountry: "RS",
    strictPriceLimit: false,
    avoidComplexCompliance: true,
    privateLabel: false,
  };

  it("translates Serbian food packaging intent and preserves the requested volume range", () => {
    const plan = createLunaSearchPlan(foodPackagingRequest);

    expect(plan.category).toBe("food-packaging");
    expect(plan.englishQuery).toBe("food containers packaging");
    expect(plan.providerQueries).toEqual([
      "400ml 500ml disposable food containers wholesale manufacturer supplier",
      "400-500ml takeaway food containers wholesale manufacturer supplier",
      "400ml 500ml food storage containers with lids wholesale manufacturer supplier",
      "food containers packaging wholesale manufacturer supplier",
      "food containers packaging",
    ]);
    expect(plan.chinese1688Queries).toEqual([
      "400ml 500ml 一次性餐盒 食品容器 厂家 批发",
      "400-500ml 外卖餐盒 食品包装盒 厂家 批发",
      "食品容器 餐盒 包装盒 厂家 批发",
    ]);
  });

  it("passes the food packaging variants to the supplier-search provider", () => {
    const plan = createLunaSearchPlan(foodPackagingRequest);
    const providerInput = buildLunaProviderSearchInput(plan, foodPackagingRequest);

    expect(providerInput.query).toBe(plan.providerQueries[0]);
    expect(providerInput.queryVariants).toEqual(plan.providerQueries);
    expect(providerInput.chinese1688QueryVariants).toEqual(plan.chinese1688Queries);
    expect(providerInput.quantity).toBe(10000);
    expect(providerInput.targetCountry).toBe("RS");
  });
});
