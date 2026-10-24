import { describe, expect, it } from "vitest";

import { effectiveMonthlySupplierSearchLimit } from "../../modules/subscriptions/domain/supplier-search-test-override";

const organizationId = "b0f722bc-aa34-4942-97fa-1859cb847155";
const environment = {
  RENDER_SERVICE_ID: "srv-datu3v093c1s73c17m60",
  JAKOV360_ACCEPTANCE_TEST_ORG_ID: organizationId,
  JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT: "100",
};

describe("acceptance-staging test supplier-search allowance", () => {
  it("keeps the public Free, Plus and Pro limits without an exact opt-in", () => {
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, {})).toBe(3);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "PLUS", organizationId }, {})).toBe(20);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "PRO", organizationId }, {})).toBe(50);
  });

  it("grants an allowance only to the specific Free test organization and Render service", () => {
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, environment)).toBe(100);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId: "another-org" }, environment)).toBe(3);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, {
      ...environment,
      RENDER_SERVICE_ID: "srv-production",
    })).toBe(3);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "PLUS", organizationId }, environment)).toBe(20);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "PRO", organizationId }, environment)).toBe(50);
  });

  it("fails closed for invalid, disabled and unreasonable allowances", () => {
    for (const raw of ["", "0", "3", "100.5", "xyz", "-50", "501", "1000000"]) {
      expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, {
        ...environment,
        JAKOV360_ACCEPTANCE_TEST_MONTHLY_LIMIT: raw,
      })).toBe(3);
    }
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, {
      ...environment,
      JAKOV360_ACCEPTANCE_TEST_ORG_ID: "",
    })).toBe(3);
    expect(effectiveMonthlySupplierSearchLimit({ plan: "FREE", organizationId }, {
      ...environment,
      JAKOV360_ACCEPTANCE_TEST_ORG_ID: "unrelated",
    })).toBe(3);
  });
});
