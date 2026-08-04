import { describe, expect, it } from "vitest";

import { getMobileWorkflowActions } from "../../modules/projects/domain/mobile-workflow-actions";

const baseInput = {
  projectId: "project-1",
  offerCount: 0,
  calculatedOfferCount: 0,
  assessedOfferCount: 0,
  hasFinalRecommendation: false,
  decisionStatus: null,
};

describe("mobile workflow actions", () => {
  it("starts with adding an offer when offers are missing", () => {
    expect(getMobileWorkflowActions(baseInput)).toEqual([
      { href: "#workflow-step-offer", label: "Dodaj ponudu", variant: "PRIMARY" },
    ]);
  });

  it("asks for calculation before profitability check", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 1,
    })).toEqual([
      { href: "#workflow-step-decision", label: "Izračunaj", variant: "PRIMARY" },
    ]);
  });

  it("uses one profitability action instead of separate assessment and recommendation actions", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 2,
      assessedOfferCount: 0,
    })).toEqual([
      { href: "#workflow-step-decision", label: "Proveri isplativost", variant: "PRIMARY" },
    ]);
  });

  it("opens negotiation directly when negotiation is recommended", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasFinalRecommendation: true,
      decisionStatus: "NEGOTIATE_FIRST",
    })).toEqual([
      { href: "#negotiation-assistant", label: "Pregovaraj", variant: "PRIMARY" },
    ]);
  });

  it("returns to offer search when the current offer should be skipped", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasFinalRecommendation: true,
      decisionStatus: "DO_NOT_BUY",
    })).toEqual([
      { href: "#workflow-step-offer", label: "Pronađi nove ponude", variant: "PRIMARY" },
    ]);
  });

  it("shows one continuation action for a buy decision", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasFinalRecommendation: true,
      decisionStatus: "READY_TO_BUY",
    })).toEqual([
      { href: "#documents", label: "Krenite u kupovinu", variant: "PRIMARY" },
    ]);
  });
});
