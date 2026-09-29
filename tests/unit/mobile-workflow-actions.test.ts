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
  currentStep: "OFFERS" as const,
};

describe("mobile workflow actions", () => {
  it("starts with adding an offer when offers are missing", () => {
    expect(getMobileWorkflowActions(baseInput)).toEqual([
      { href: "/projects/project-1/offers", label: "Dodaj ponudu", variant: "PRIMARY" },
    ]);
  });

  it("continues from offer selection to analysis", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 1,
    })[0]).toMatchObject({ href: "/projects/project-1/analysis", label: "Nastavi na analizu" });
  });

  it("continues from analysis to costs after assessment", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 2,
      calculatedOfferCount: 1,
      assessedOfferCount: 2,
      currentStep: "ANALYSIS",
    })[0]).toMatchObject({ href: "/projects/project-1/costs", label: "Nastavi na troškove uvoza" });
  });

  it("does not add a misleading sticky action on an incomplete decision page", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      currentStep: "DECISION",
    })).toEqual([]);
  });

  it("shows compact final actions when the decision is ready", () => {
    expect(getMobileWorkflowActions({
      ...baseInput,
      offerCount: 1,
      calculatedOfferCount: 1,
      assessedOfferCount: 1,
      hasFinalRecommendation: true,
      decisionStatus: "NEGOTIATE_FIRST",
      currentStep: "DECISION",
    })).toEqual([
      { href: "/projects/project-1/summary", label: "PDF", variant: "PRIMARY" },
      { href: "/projects/project-1/decision#negotiation-assistant", label: "Kontakt", variant: "SECONDARY" },
      { href: "/projects/project-1/offers", label: "Izaberi drugu ponudu", variant: "SECONDARY" },
    ]);
  });

  it("localizes mobile labels", () => {
    expect(translateText("Izračunaj", "en")).toBe("Calculate");
    expect(translateText("Analiziraj", "de")).toBe("Analysieren");
    expect(translateText("Kontakt", "sr")).toBe("Kontakt");
  });
});
