import { describe, expect, it } from "vitest";

import { getProjectWorkflow } from "../../modules/projects/domain/project-workflow";

function statuses(input: Parameters<typeof getProjectWorkflow>[0]) {
  return Object.fromEntries(getProjectWorkflow(input).map((step) => [step.id, step.status]));
}

describe("project guided workflow", () => {
  it("activates only add offer when there is no offer", () => {
    expect(statuses({
      offerCount: 0,
      calculatedOfferCount: 0,
      assessedOfferCount: 0,
      hasDecision: false,
      decisionStatus: null,
    })).toMatchObject({
      PRODUCT: "COMPLETED",
      OFFER: "ACTIVE",
      COST: "LOCKED",
      ANALYSIS: "LOCKED",
      DECISION: "LOCKED",
      NEGOTIATION: "HIDDEN",
    });
  });

  it("activates cost after an offer is added", () => {
    expect(statuses({
      offerCount: 1,
      calculatedOfferCount: 0,
      assessedOfferCount: 0,
      hasDecision: false,
      decisionStatus: null,
    }).COST).toBe("ACTIVE");
  });

  it("activates analysis after cost is calculated", () => {
    expect(statuses({
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 0,
      hasDecision: false,
      decisionStatus: null,
    }).ANALYSIS).toBe("ACTIVE");
  });

  it("activates decision after an assessment is completed", () => {
    expect(statuses({
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasDecision: false,
      decisionStatus: null,
    }).DECISION).toBe("ACTIVE");
  });

  it("keeps analysis active and decision locked while a calculated offer awaits analysis", () => {
    expect(statuses({
      offerCount: 2,
      calculatedOfferCount: 2,
      assessedOfferCount: 1,
      hasDecision: true,
      decisionStatus: "READY_TO_BUY",
    })).toMatchObject({
      ANALYSIS: "ACTIVE",
      DECISION: "LOCKED",
      NEGOTIATION: "HIDDEN",
    });
  });

  it("separates calculated-offer analysis completion from active-offer decision readiness", () => {
    expect(statuses({
      offerCount: 2,
      calculatedOfferCount: 1,
      assessedCalculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasDecision: false,
      decisionStatus: null,
    })).toMatchObject({
      ANALYSIS: "COMPLETED",
      DECISION: "LOCKED",
    });
  });

  it("shows negotiation only for a negotiate decision", () => {
    const result = statuses({
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasDecision: true,
      decisionStatus: "NEGOTIATE_FIRST",
    });
    expect(result.DECISION).toBe("COMPLETED");
    expect(result.NEGOTIATION).toBe("ACTIVE");
  });
});
