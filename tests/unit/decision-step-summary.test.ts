import { describe, expect, it } from "vitest";

import {
  getDecisionStepSummary,
  isFinalDecisionStatus,
} from "../../modules/decisions/application/decision-step-summary";

describe("decision step summary", () => {
  it("shows only final recommendation labels for completed decisions", () => {
    expect(getDecisionStepSummary("READY_TO_BUY", "sr")).toBe("KUPI");
    expect(getDecisionStepSummary("NEGOTIATE_FIRST", "sr")).toBe("PREGOVARAJ");
    expect(getDecisionStepSummary("DO_NOT_BUY", "sr")).toBe("PRESKOČI");
  });

  it("does not expose NEED_MORE_OFFERS as DODAJ PONUDE in step 5", () => {
    expect(getDecisionStepSummary("NEED_MORE_OFFERS", "sr")).toBe("Generiši preporuku");
    expect(getDecisionStepSummary(null, "sr")).toBe("Generiši preporuku");
    expect(isFinalDecisionStatus("NEED_MORE_OFFERS")).toBe(false);
    expect(isFinalDecisionStatus("READY_TO_BUY")).toBe(true);
  });
});
