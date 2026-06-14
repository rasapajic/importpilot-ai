import { describe, expect, it } from "vitest";

import {
  createProjectDecision,
  ProjectDecisionStatuses,
  type ProjectDecisionOffer,
} from "../../modules/decisions/domain/project-decision";

function offer(
  overrides: Partial<ProjectDecisionOffer> & Pick<ProjectDecisionOffer, "offerId" | "supplierName">,
): ProjectDecisionOffer {
  return {
    currency: "EUR",
    incoterm: "FOB",
    moq: 100,
    moqExceedsProjectQuantity: false,
    sampleAvailable: true,
    shippingClarityScore: 90,
    landedCostTotal: 1000,
    landedCostPerUnit: 10,
    grossMarginPercent: 30,
    calculationNeedsReview: false,
    assessment: {
      overallScore: 85,
      supplierRiskScore: 15,
      supplierRiskLevel: "LOW",
      confidenceScore: 90,
      recommendationStatus: "RECOMMENDED",
    },
    ...overrides,
  };
}

describe("project decision", () => {
  it("returns READY_TO_BUY for three comparable, assessed and ready offers", () => {
    const result = createProjectDecision([
      offer({ offerId: "best", supplierName: "Best", assessment: { overallScore: 92, supplierRiskScore: 10, supplierRiskLevel: "LOW", confidenceScore: 95, recommendationStatus: "RECOMMENDED" } }),
      offer({ offerId: "two", supplierName: "Two" }),
      offer({ offerId: "three", supplierName: "Three" }),
    ]);
    expect(result.status).toBe(ProjectDecisionStatuses.READY_TO_BUY);
    expect(result.selectedOfferId).toBe("best");
  });

  it("returns NEED_MORE_OFFERS when comparable or assessed offers are insufficient", () => {
    const result = createProjectDecision([
      offer({ offerId: "eur", supplierName: "EUR" }),
      offer({ offerId: "usd", supplierName: "USD", currency: "USD", assessment: null }),
    ]);
    expect(result.status).toBe(ProjectDecisionStatuses.NEED_MORE_OFFERS);
    expect(result.actionChecklist.some((item) => item.key === "COMPARE_MORE_OFFERS")).toBe(true);
  });

  it("returns NEGOTIATE_FIRST for a fixable best offer", () => {
    const weak = offer({
      offerId: "best",
      supplierName: "Best",
      sampleAvailable: false,
      shippingClarityScore: 40,
      assessment: { overallScore: 75, supplierRiskScore: 30, supplierRiskLevel: "MEDIUM", confidenceScore: 80, recommendationStatus: "OK_WITH_RISK" },
    });
    const result = createProjectDecision([
      weak,
      offer({ offerId: "two", supplierName: "Two", assessment: { overallScore: 70, supplierRiskScore: 35, supplierRiskLevel: "MEDIUM", confidenceScore: 80, recommendationStatus: "OK_WITH_RISK" } }),
      offer({ offerId: "three", supplierName: "Three", assessment: { overallScore: 65, supplierRiskScore: 40, supplierRiskLevel: "MEDIUM", confidenceScore: 80, recommendationStatus: "OK_WITH_RISK" } }),
    ]);
    expect(result.status).toBe(ProjectDecisionStatuses.NEGOTIATE_FIRST);
    expect(result.actionChecklist.map((item) => item.key)).toContain("CONFIRM_SHIPPING");
  });

  it("returns DO_NOT_BUY when the best comparable offer is not recommended", () => {
    const bad = offer({
      offerId: "bad",
      supplierName: "Bad",
      assessment: { overallScore: 40, supplierRiskScore: 80, supplierRiskLevel: "HIGH", confidenceScore: 90, recommendationStatus: "NOT_RECOMMENDED" },
    });
    const result = createProjectDecision([
      bad,
      offer({ offerId: "worse", supplierName: "Worse", assessment: { overallScore: 30, supplierRiskScore: 90, supplierRiskLevel: "HIGH", confidenceScore: 90, recommendationStatus: "NOT_RECOMMENDED" } }),
      offer({ offerId: "worst", supplierName: "Worst", assessment: { overallScore: 20, supplierRiskScore: 95, supplierRiskLevel: "HIGH", confidenceScore: 90, recommendationStatus: "NOT_RECOMMENDED" } }),
    ]);
    expect(result.status).toBe(ProjectDecisionStatuses.DO_NOT_BUY);
  });

  it("does not return READY_TO_BUY when the best offer has high supplier risk", () => {
    const result = createProjectDecision([
      offer({
        offerId: "risky",
        supplierName: "Risky",
        assessment: {
          overallScore: 92,
          supplierRiskScore: 70,
          supplierRiskLevel: "HIGH",
          confidenceScore: 95,
          recommendationStatus: "RECOMMENDED",
        },
      }),
      offer({ offerId: "two", supplierName: "Two" }),
      offer({ offerId: "three", supplierName: "Three" }),
    ]);

    expect(result.status).not.toBe(ProjectDecisionStatuses.READY_TO_BUY);
  });

  it("does not return READY_TO_BUY when MOQ exceeds project quantity", () => {
    const result = createProjectDecision([
      offer({ offerId: "blocking", supplierName: "Blocking MOQ", moq: 3000, moqExceedsProjectQuantity: true }),
      offer({ offerId: "two", supplierName: "Two" }),
      offer({ offerId: "three", supplierName: "Three" }),
    ]);

    expect(result.status).not.toBe(ProjectDecisionStatuses.READY_TO_BUY);
    expect(result.actionChecklist.map((item) => item.key)).toContain("NEGOTIATE_MOQ");
  });

  it("does not compare currencies directly and reports incomparable offers", () => {
    const result = createProjectDecision([
      offer({ offerId: "eur-1", supplierName: "EUR 1" }),
      offer({ offerId: "eur-2", supplierName: "EUR 2" }),
      offer({ offerId: "usd", supplierName: "USD", currency: "USD" }),
      offer({ offerId: "none", supplierName: "No Currency", currency: null }),
    ]);
    expect(result.summarySnapshot.primaryCurrency).toBe("EUR");
    expect(result.summarySnapshot.comparableOfferCount).toBe(2);
    expect(result.summarySnapshot.incomparableOfferCount).toBe(2);
    expect(result.summarySnapshot.incomparableCurrencies).toEqual(["NO_CURRENCY", "USD"]);
  });

  it("builds an explainable action checklist from the selected offer", () => {
    const best = offer({
      offerId: "best",
      supplierName: "Best",
      incoterm: null,
      moqExceedsProjectQuantity: true,
      sampleAvailable: null,
      shippingClarityScore: null,
      calculationNeedsReview: true,
    });
    const result = createProjectDecision([
      best,
      offer({ offerId: "two", supplierName: "Two" }),
      offer({ offerId: "three", supplierName: "Three" }),
    ]);
    expect(result.actionChecklist.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "REQUEST_SAMPLE",
        "CONFIRM_INCOTERM",
        "CONFIRM_SHIPPING",
        "NEGOTIATE_MOQ",
        "VERIFY_CUSTOMS",
      ]),
    );
  });
});
