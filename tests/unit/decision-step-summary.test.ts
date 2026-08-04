import { describe, expect, it } from "vitest";

import {
  getDecisionStepSummary,
  getDecisionStepTitle,
  isFinalDecisionStatus,
} from "../../modules/decisions/application/decision-step-summary";

describe("decision step display", () => {
  it("separates the business outcome from the next action", () => {
    expect(getDecisionStepTitle("READY_TO_BUY", "sr")).toBe("Isplati se");
    expect(getDecisionStepSummary("READY_TO_BUY", "sr")).toBe("Nastavi sa proverama");

    expect(getDecisionStepTitle("NEGOTIATE_FIRST", "sr")).toBe("Može se isplatiti");
    expect(getDecisionStepSummary("NEGOTIATE_FIRST", "sr")).toBe("Traži bolje uslove");

    expect(getDecisionStepTitle("DO_NOT_BUY", "sr")).toBe("Ne isplati se");
    expect(getDecisionStepSummary("DO_NOT_BUY", "sr")).toBe("Traži bolju ponudu");
  });

  it("localizes the unprofitable outcome", () => {
    expect(getDecisionStepTitle("DO_NOT_BUY", "de")).toBe("Nicht rentabel");
    expect(getDecisionStepSummary("DO_NOT_BUY", "de")).toBe("Besseres Angebot suchen");
    expect(getDecisionStepTitle("DO_NOT_BUY", "en")).toBe("Not profitable");
    expect(getDecisionStepSummary("DO_NOT_BUY", "en")).toBe("Find a better offer");
  });

  it("keeps the question before a final decision exists", () => {
    expect(getDecisionStepTitle("NEED_MORE_OFFERS", "sr")).toBe("Da li se isplati?");
    expect(getDecisionStepSummary("NEED_MORE_OFFERS", "sr")).toBe("Generiši preporuku");
    expect(getDecisionStepTitle(null, "sr")).toBe("Da li se isplati?");
    expect(isFinalDecisionStatus("NEED_MORE_OFFERS")).toBe(false);
    expect(isFinalDecisionStatus("READY_TO_BUY")).toBe(true);
  });
});
