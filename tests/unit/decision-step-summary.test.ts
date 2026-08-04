import { describe, expect, it } from "vitest";

import {
  getDecisionStepSummary,
  isFinalDecisionStatus,
} from "../../modules/decisions/application/decision-step-summary";

describe("decision step summary", () => {
  it("explains completed decisions instead of showing bare commands", () => {
    expect(getDecisionStepSummary("READY_TO_BUY", "sr")).toBe("Da — isplativo je");
    expect(getDecisionStepSummary("NEGOTIATE_FIRST", "sr")).toBe(
      "Može biti isplativo uz bolje uslove",
    );
    expect(getDecisionStepSummary("DO_NOT_BUY", "sr")).toBe(
      "Ne — trenutno se ne isplati",
    );
  });

  it("localizes the outcome explanation", () => {
    expect(getDecisionStepSummary("DO_NOT_BUY", "de")).toBe(
      "Nein — derzeit nicht rentabel",
    );
    expect(getDecisionStepSummary("DO_NOT_BUY", "en")).toBe(
      "No — not profitable under current terms",
    );
  });

  it("does not expose NEED_MORE_OFFERS as a completed decision", () => {
    expect(getDecisionStepSummary("NEED_MORE_OFFERS", "sr")).toBe("Generiši preporuku");
    expect(getDecisionStepSummary(null, "sr")).toBe("Generiši preporuku");
    expect(isFinalDecisionStatus("NEED_MORE_OFFERS")).toBe(false);
    expect(isFinalDecisionStatus("READY_TO_BUY")).toBe(true);
  });
});
