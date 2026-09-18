import { describe, expect, it } from "vitest";

import {
  getDecisionStepSummary,
  getDecisionStepTitle,
  isFinalDecisionStatus,
} from "../../modules/decisions/application/decision-step-summary";

describe("decision step display", () => {
  it("localizes the simple ImportPilot 1.0 decision vocabulary", () => {
    expect(getDecisionStepTitle("READY_TO_BUY", "sr")).toBe("KUPI");
    expect(getDecisionStepTitle("NEGOTIATE_FIRST", "sr")).toBe("PREGOVARAJ");
    expect(getDecisionStepTitle("NEED_MORE_OFFERS", "sr")).toBe("PRATI");
    expect(getDecisionStepTitle("DO_NOT_BUY", "sr")).toBe("PRESKOČI");
    expect(getDecisionStepTitle("READY_TO_BUY", "en")).toBe("BUY");
  });

  it("keeps the explanation localized with locale-specific status labels", () => {
    expect(getDecisionStepSummary("READY_TO_BUY", "sr")).toBe("Ponuda prolazi osnovne provere");
    expect(getDecisionStepSummary("NEGOTIATE_FIRST", "de")).toBe("Vor dem Kauf bessere Konditionen verhandeln");
    expect(getDecisionStepSummary("NEED_MORE_OFFERS", "en")).toBe("There is not enough data for a decision yet");
    expect(getDecisionStepSummary("DO_NOT_BUY", "sr")).toBe("Odnos cene i rizika nije dovoljno dobar");
  });

  it("keeps WATCH non-final and only completed outcomes final", () => {
    expect(isFinalDecisionStatus("NEED_MORE_OFFERS")).toBe(false);
    expect(isFinalDecisionStatus("READY_TO_BUY")).toBe(true);
    expect(isFinalDecisionStatus("NEGOTIATE_FIRST")).toBe(true);
    expect(isFinalDecisionStatus("DO_NOT_BUY")).toBe(true);
  });

  it("keeps the question before any decision exists", () => {
    expect(getDecisionStepTitle(null, "sr")).toBe("Da li se isplati?");
    expect(getDecisionStepSummary(null, "sr")).toBe("Generiši preporuku");
  });
});
