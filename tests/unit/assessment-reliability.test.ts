import { describe, expect, it } from "vitest";

import {
  getSupplierRiskLevel,
  hasReliableDetailedAssessment,
} from "../../modules/intelligence/domain/assessment-reliability";

describe("assessment score reliability", () => {
  it("hides detailed scores when supplier data is insufficient and confidence is very low", () => {
    const scoreBreakdown = { supplierRiskV2: { riskLevel: "UNKNOWN" } };
    expect(getSupplierRiskLevel(scoreBreakdown)).toBe("UNKNOWN");
    expect(hasReliableDetailedAssessment({ confidenceScore: 24, scoreBreakdown })).toBe(false);
  });

  it("keeps detailed scores when the assessment has sufficient confidence", () => {
    expect(hasReliableDetailedAssessment({
      confidenceScore: 70,
      scoreBreakdown: { supplierRiskV2: { riskLevel: "LOW" } },
    })).toBe(true);
  });
});
