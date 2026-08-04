import { describe, expect, it } from "vitest";

import {
  createRecoverySearchCriteria,
  readRecoverySearchCriteria,
} from "../../modules/product-search/domain/recovery-search";

describe("recovery search criteria", () => {
  it("rounds the calculated supplier cap to a visible two-decimal search limit", () => {
    expect(createRecoverySearchCriteria("3.4801", "usd")).toEqual({
      maxUnitPrice: "3.48",
      currency: "USD",
      strictPriceLimit: true,
    });
  });

  it("rejects invalid prices and currencies", () => {
    expect(createRecoverySearchCriteria("0", "USD")).toBeNull();
    expect(createRecoverySearchCriteria("3.48", "US")).toBeNull();
  });

  it("reads only a valid event payload", () => {
    expect(readRecoverySearchCriteria({ maxUnitPrice: 3.48, currency: "USD" })).toEqual({
      maxUnitPrice: "3.48",
      currency: "USD",
      strictPriceLimit: true,
    });
    expect(readRecoverySearchCriteria({ maxUnitPrice: "x", currency: "USD" })).toBeNull();
  });
});
