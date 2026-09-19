import { describe, expect, it } from "vitest";

import {
  getJakov360PaidPlanPolicy,
  getJakov360PlanPolicy,
  JAKOV360_FULL_IMPORT_ANALYSIS,
  JAKOV360_PAID_PLANS,
  JAKOV360_PLANS,
  JAKOV360_SEARCH_LIMIT_EXHAUSTED_POLICY,
} from "../../modules/subscriptions/domain/jakov360-paid-plans";

describe("JAKOV360 launch-plan search policy", () => {
  it("locks the Free launch quota at three monthly supplier searches", () => {
    expect(JAKOV360_PLANS.FREE).toEqual({
      code: "FREE",
      monthlyPriceEurCents: 0,
      monthlySupplierSearchLimit: 3,
    });
  });

  it("locks the Plus launch price and monthly supplier-search limit", () => {
    expect(JAKOV360_PAID_PLANS.PLUS).toEqual({
      code: "PLUS",
      monthlyPriceEurCents: 999,
      monthlySupplierSearchLimit: 20,
    });
  });

  it("locks the Pro launch price and monthly supplier-search limit", () => {
    expect(JAKOV360_PAID_PLANS.PRO).toEqual({
      code: "PRO",
      monthlyPriceEurCents: 1999,
      monthlySupplierSearchLimit: 50,
    });
  });

  it("keeps the one-off Full Import Analysis at 1.99 EUR and includes one live search", () => {
    expect(JAKOV360_FULL_IMPORT_ANALYSIS).toEqual({
      priceEurCents: 199,
      includedLiveSupplierSearches: 1,
      includedFullImportAnalyses: 1,
    });
  });

  it("keeps existing work readable when the search quota is exhausted", () => {
    expect(JAKOV360_SEARCH_LIMIT_EXHAUSTED_POLICY).toEqual({
      allowExistingProjects: true,
      allowSavedResults: true,
      allowLiveSupplierSearch: false,
      allowOneOffFullImportAnalysisPurchase: true,
      upgradePlans: ["PLUS", "PRO"],
    });
  });

  it("uses one policy source for future billing and entitlement enforcement", () => {
    expect(getJakov360PlanPolicy("FREE").monthlySupplierSearchLimit).toBe(3);
    expect(getJakov360PaidPlanPolicy("PLUS").monthlySupplierSearchLimit).toBe(20);
    expect(getJakov360PaidPlanPolicy("PRO").monthlySupplierSearchLimit).toBe(50);
  });
});
