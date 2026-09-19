import { describe, expect, it } from "vitest";

import {
  getJakov360PaidPlanPolicy,
  JAKOV360_PAID_PLANS,
} from "../../modules/subscriptions/domain/jakov360-paid-plans";

describe("JAKOV360 paid-plan search policy", () => {
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

  it("uses one policy source for future billing and entitlement enforcement", () => {
    expect(getJakov360PaidPlanPolicy("PLUS").monthlySupplierSearchLimit).toBe(20);
    expect(getJakov360PaidPlanPolicy("PRO").monthlySupplierSearchLimit).toBe(50);
  });
});
