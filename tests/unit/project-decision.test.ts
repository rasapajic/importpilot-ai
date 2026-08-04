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

  it("returns READY_TO_BUY for one strong assessed offer and still recommends comparison", () => {
    const result = createProjectDecision([
      offer({ offerId: "single", supplierName: "Single" }),
    ]);

    expect(result.status).toBe(ProjectDecisionStatuses.READY_TO_BUY);
    expect(result.selectedOfferId).toBe("single");
    expect(result.actionChecklist.map((item) => item.key)).toContain("COMPARE_MORE_OFFERS");
  });

  it("returns NEGOTIATE_FIRST for one fixable assessed offer", () => {
    const result = createProjectDecision([
      offer({
        offerId: "single",
        supplierName: "Single",
        sampleAvailable: false,
        shippingClarityScore: 40,
        assessment: {
          overallScore: 75,
          supplierRiskScore: 30,
          supplierRiskLevel: "MEDIUM",
          confidenceScore: 80,
          recommendationStatus: "OK_WITH_RISK",
        },
      }),
    ]);

    expect(result.status).toBe(ProjectDecisionStatuses.NEGOTIATE_FIRST);
    expect(result.actionChecklist.map((item) => item.key)).toContain("CONFIRM_SHIPPING");
  });

  it("returns DO_NOT_BUY for one assessed offer that is not recommended", () => {
    const result = createProjectDecision([
      offer({
        offerId: "single",
        supplierName: "Single",
        assessment: {
          overallScore: 40,
          supplierRiskScore: 80,
          supplierRiskLevel: "HIGH",
          confidenceScore: 90,
          recommendationStatus: "NOT_RECOMMENDED",
        },
      }),
    ]);

    expect(result.status).toBe(ProjectDecisionStatuses.DO_NOT_BUY);
  });

  it("returns NEED_MORE_OFFERS when no usable assessed offer exists", () => {
    const result = createProjectDecision([
      offer({ offerId: "eur", supplierName: "EUR", assessment: null }),
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

  it("returns DO_NOT_BUY when even the best margin is below half of the project target", () => {
    const result = createProjectDecision([
      offer({ offerId: "negative", supplierName: "Negative", grossMarginPercent: -3.3 }),
      offer({ offerId: "best-margin", supplierName: "Best Margin", grossMarginPercent: 5.8 }),
      offer({ offerId: "low", supplierName: "Low", grossMarginPercent: 1.8 }),
    ], 25);

    expect(result.status).toBe(ProjectDecisionStatuses.DO_NOT_BUY);
    expect(result.selectedOfferId).toBe("best-margin");
    expect(result.decisionReason).toContain("manje od polovine ciljne marže");
    expect(result.decisionReason).toContain("po trenutnim cenama projekat nije isplativ");
  });

  it("returns NEGOTIATE_FIRST when margin is below target but at least half of it", () => {
    const result = createProjectDecision([
      offer({
        offerId: "negotiable",
        supplierName: "Negotiable",
        grossMarginPercent: 20,
      }),
    ], 25);

    expect(result.status).toBe(ProjectDecisionStatuses.NEGOTIATE_FIRST);
  });

  it("allows READY_TO_BUY only when the selected offer reaches the project target margin", () => {
    const belowTarget = createProjectDecision([
      offer({ offerId: "below", supplierName: "Below", grossMarginPercent: 24.9 }),
    ], 25);
    const reachesTarget = createProjectDecision([
      offer({ offerId: "ready", supplierName: "Ready", grossMarginPercent: 25 }),
    ], 25);

    expect(belowTarget.status).toBe(ProjectDecisionStatuses.NEGOTIATE_FIRST);
    expect(reachesTarget.status).toBe(ProjectDecisionStatuses.READY_TO_BUY);
  });
});
