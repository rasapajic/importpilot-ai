import { describe, expect, it } from "vitest";

import { getMobileWorkflowActions } from "../../modules/projects/domain/mobile-workflow-actions";
import { translateText } from "../../modules/i18n/translations";

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

  it("asks for calculation before analysis", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 1,
    })[0]).toMatchObject({ href: "#workflow-step-decision", label: "Izračunaj" });
  });

  it("asks for analysis before recommendation", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 2,
      assessedOfferCount: 1,
    })[0]).toMatchObject({ href: "#workflow-step-decision", label: "Oceni" });
  });

  it("asks for recommendation before final next actions", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
    })[0]).toMatchObject({ href: "#workflow-step-decision", label: "Generiši preporuku" });
  });

  it("shows compact final actions when the decision is ready", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasFinalRecommendation: true,
      decisionStatus: "NEGOTIATE_FIRST",
    })).toEqual([
      { href: "/projects/project-1/summary", label: "PDF", variant: "PRIMARY" },
      { href: "#negotiation-assistant", label: "Kontakt", variant: "SECONDARY" },
      { href: "/projects/project-1?newAnalysis=1#workflow-step-decision", label: "Nova analiza", variant: "SECONDARY" },
    ]);
  });

  it("localizes mobile labels", () => {
    expect(translateText("Izračunaj", "en")).toBe("Calculate");
    expect(translateText("Oceni", "de")).toBe("Bewerten");
    expect(translateText("Kontakt", "sr")).toBe("Kontakt");
  });
});
