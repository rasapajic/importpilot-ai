import { describe, expect, it } from "vitest";

import {
  getDecisionExpectedProfit,
  getDecisionNextActions,
} from "../../modules/decisions/application/decision-summary";

describe("decision summary", () => {
  it("summarizes expected profit from the selected calculation without changing it", () => {
    expect(getDecisionExpectedProfit({
      targetSellingPrice: "20.00",
      landedCostPerUnit: "14.52",
      quantity: 100,
    })).toBe("548.00");
  });

  it("shows negotiation and sample actions from the existing decision", () => {
    expect(getDecisionNextActions("NEGOTIATE_FIRST", [{
      key: "REQUEST_SAMPLE",
      label: "Traži uzorak",
      reason: "Uzorak nije potvrđen.",
    }])).toEqual([
      "Contact supplier",
      "Request sample",
      "Negotiate",
      "Add import documents",
    ]);
  });

  it("does not suggest contacting a supplier after a skip decision", () => {
    expect(getDecisionNextActions("DO_NOT_BUY", [])).toEqual(["Add import documents"]);
  });
});
