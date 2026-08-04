import { describe, expect, it } from "vitest";

import {
  getDecisionStepSummary,
  isFinalDecisionStatus,
} from "../../modules/decisions/application/decision-step-summary";

describe("decision step summary", () => {
  it("explains completed decisions and the next action", () => {
    expect(getDecisionStepSummary("READY_TO_BUY", "sr")).toBe(
      "Isplati se — nastavi sa proverama",
    );
    expect(getDecisionStepSummary("NEGOTIATE_FIRST", "sr")).toBe(
      "Može se isplatiti — traži bolje uslove",
    );
    expect(getDecisionStepSummary("DO_NOT_BUY", "sr")).toBe(
      "Ne isplati se — traži bolju ponudu",
    );
  });

  it("localizes the actionable outcome", () => {
    expect(getDecisionStepSummary("DO_NOT_BUY", "de")).toBe(
      "Nicht rentabel — besseres Angebot suchen",
    );
    expect(getDecisionStepSummary("DO_NOT_BUY", "en")).toBe(
      "Not profitable — find a better offer",
    );
  });

  it("does not expose NEED_MORE_OFFERS as a completed decision", () => {
    expect(getDecisionStepSummary("NEED_MORE_OFFERS", "sr")).toBe("Generiši preporuku");
    expect(getDecisionStepSummary(null, "sr")).toBe("Generiši preporuku");
    expect(isFinalDecisionStatus("NEED_MORE_OFFERS")).toBe(false);
    expect(isFinalDecisionStatus("READY_TO_BUY")).toBe(true);
  });
});
