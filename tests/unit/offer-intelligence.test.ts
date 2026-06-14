import { describe, expect, it } from "vitest";

import { compareOffers } from "../../modules/intelligence/domain/comparison";
import {
  assessOffer,
  calculateOfferQuality,
  calculateSupplierRisk,
  determineRecommendation,
  generateDeterministicExplanation,
  type AssessmentOfferInput,
} from "../../modules/intelligence/domain/scoring";
import { RecommendationStatuses } from "../../modules/intelligence/domain/recommendation";
import { getMoqStatus } from "../../modules/offers/domain/moq-status";
import { assessSupplierRiskV2 } from "../../modules/intelligence/domain/supplier-risk-v2";

const strongOffer: AssessmentOfferInput = {
  offerId: "offer-1",
  supplierName: "Strong Supplier",
  supplierCountry: "CN",
  supplierVerified: true,
  yearsOnPlatform: 8,
  responseRatePercent: 95,
  transactionCount: 120,
  employeeCount: 80,
  profileCompletenessScore: 90,
  moq: 500,
  unitPrice: 10,
  currency: "USD",
  incoterm: "FOB",
  deliveryTimeDays: 20,
  sampleAvailable: true,
  termsClarityScore: 90,
  shippingClarityScore: 90,
  projectQuantity: 1000,
  projectTargetMargin: 25,
  landedCostPerUnit: 13,
  grossMarginPercent: 30,
};

describe("supplier offer intelligence", () => {
  it("produces a deterministic recommended result for a strong offer", () => {
    const first = assessOffer(strongOffer, {
      currency: "USD",
      unitPrices: [10, 11, 12],
    });
    const second = assessOffer(strongOffer, {
      currency: "USD",
      unitPrices: [10, 11, 12],
    });
    expect(first).toEqual(second);
    expect(first.recommendationStatus).toBe(RecommendationStatuses.RECOMMENDED);
    expect(first.supplierRiskScore).toBe(0);
    expect(first.scoreBreakdown.supplierRiskV2.riskLevel).toBe("LOW");
  });

  it("flags a suspiciously low price only with three same-currency offers", () => {
    const lowPrice = { ...strongOffer, unitPrice: 5 };
    expect(
      calculateSupplierRisk(lowPrice, { currency: "USD", unitPrices: [5, 10, 11] }).components
        .find((item) => item.key === "suspiciousLowPrice")?.score,
    ).toBe(15);
    expect(
      calculateSupplierRisk(lowPrice, { currency: "USD", unitPrices: [5, 10] }).components
        .find((item) => item.key === "suspiciousLowPrice")?.score,
    ).toBe(0);
  });

  it("scores delivery, MOQ, Incoterm, sample and clarity deterministically", () => {
    const strong = calculateOfferQuality(strongOffer);
    const weak = calculateOfferQuality({
      ...strongOffer,
      deliveryTimeDays: 90,
      moq: 3000,
      incoterm: null,
      sampleAvailable: false,
      termsClarityScore: 20,
      shippingClarityScore: 20,
      grossMarginPercent: -5,
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.components.find((item) => item.key === "sampleAvailable")?.score).toBe(0);
  });

  it("reduces confidence for missing data without adding automatic high risk", () => {
    const unknown = assessOffer({
      ...strongOffer,
      supplierVerified: null,
      yearsOnPlatform: null,
      responseRatePercent: null,
      transactionCount: null,
      employeeCount: null,
      profileCompletenessScore: null,
      supplierCountry: null,
      sampleAvailable: null,
      termsClarityScore: null,
      shippingClarityScore: null,
    });
    expect(unknown.confidenceScore).toBeLessThan(100);
    expect(unknown.scoreBreakdown.supplierRiskV2.riskLevel).toBe("UNKNOWN");
    expect(unknown.scoreBreakdown.supplierRiskV2.reasons).toContain("Nema dovoljno podataka o dobavljaču.");
  });

  it("uses deterministic recommendation thresholds and critical warnings", () => {
    expect(
      determineRecommendation({
        overallScore: 85,
        supplierRiskScore: 20,
        hasLandedCost: true,
        criticalWarnings: [],
      }),
    ).toBe(RecommendationStatuses.RECOMMENDED);
    expect(
      determineRecommendation({
        overallScore: 85,
        supplierRiskScore: 20,
        hasLandedCost: true,
        criticalWarnings: ["critical"],
      }),
    ).toBe(RecommendationStatuses.NOT_RECOMMENDED);
  });

  it("generates explanation only from supplied facts", () => {
    const input = { ...strongOffer, moq: 2000, shippingClarityScore: 30 };
    const result = assessOffer(input);
    expect(generateDeterministicExplanation(input, result))
      .toContain("pregovarajte o nižoj minimalnoj količini (MOQ)");
    expect(result.explanation).toContain("transporta");
  });

  it("evaluates MOQ status deterministically", () => {
    expect(getMoqStatus({ projectQuantity: 1000, moq: 500 }).status).toBe("OK");
    expect(getMoqStatus({ projectQuantity: 100, moq: 3000 }).status).toBe("BLOCKING");
    expect(getMoqStatus({ projectQuantity: 100, moq: null }).status).toBe("UNKNOWN");
  });

  it("scores low and high supplier risk with explainable reasons", () => {
    const low = assessSupplierRiskV2({
      verifiedSupplier: true,
      yearsOnPlatform: 5,
      responseRatePercent: 90,
      transactionCount: 100,
      employeeCount: 50,
      profileCompletenessScore: 90,
      sampleAvailable: true,
      clearCommercialTermsScore: 90,
      clearTransportScore: 90,
    });
    const high = assessSupplierRiskV2({
      verifiedSupplier: false,
      yearsOnPlatform: 0,
      responseRatePercent: 20,
      transactionCount: 0,
      employeeCount: 1,
      profileCompletenessScore: 20,
      sampleAvailable: false,
      clearCommercialTermsScore: 20,
      clearTransportScore: 20,
    });

    expect(low.riskLevel).toBe("LOW");
    expect(high.riskLevel).toBe("HIGH");
    expect(high.reasons).toContain("Dobavljač nije verifikovan.");
  });

  it("prevents automatic buy when supplier risk is high", () => {
    const result = assessOffer({
      ...strongOffer,
      supplierVerified: false,
      yearsOnPlatform: 0,
      responseRatePercent: 20,
      transactionCount: 0,
      profileCompletenessScore: 20,
      sampleAvailable: false,
      termsClarityScore: 20,
      shippingClarityScore: 20,
    });

    expect(result.scoreBreakdown.supplierRiskV2.riskLevel).toBe("HIGH");
    expect(result.recommendationStatus).not.toBe(RecommendationStatuses.RECOMMENDED);
  });

  it("prevents automatic buy when MOQ is blocking", () => {
    const result = assessOffer({ ...strongOffer, moq: 3000 });

    expect(result.scoreBreakdown.moq.status).toBe("BLOCKING");
    expect(result.recommendationStatus).not.toBe(RecommendationStatuses.RECOMMENDED);
  });

  it("converts mixed currencies into one EUR comparison group", () => {
    const groups = compareOffers([
      { offerId: "usd", supplierName: "USD Supplier", currency: "USD", landedCostTotal: 100, grossMarginPercent: 20, deliveryTimeDays: 20, supplierRiskScore: 10, overallScore: 80, recommendationStatus: RecommendationStatuses.RECOMMENDED },
      { offerId: "eur", supplierName: "EUR Supplier", currency: "EUR", landedCostTotal: 90, grossMarginPercent: 25, deliveryTimeDays: 10, supplierRiskScore: 5, overallScore: 90, recommendationStatus: RecommendationStatuses.RECOMMENDED },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].currency).toBe("EUR");
    expect(groups[0].offers.map((offer) => offer.offerId)).toEqual(["usd", "eur"]);
    expect(groups[0].bestTotalCost?.offerId).toBe("eur");
  });

  it("selects comparison winners only inside one currency group", () => {
    const [group] = compareOffers([
      { offerId: "cheap", supplierName: "Cheap", currency: "USD", landedCostTotal: 90, grossMarginPercent: 20, deliveryTimeDays: 30, supplierRiskScore: 30, overallScore: 70, recommendationStatus: RecommendationStatuses.OK_WITH_RISK },
      { offerId: "safe", supplierName: "Safe", currency: "USD", landedCostTotal: 100, grossMarginPercent: 25, deliveryTimeDays: 20, supplierRiskScore: 5, overallScore: 90, recommendationStatus: RecommendationStatuses.RECOMMENDED },
    ]);
    expect(group.bestTotalCost?.offerId).toBe("cheap");
    expect(group.lowestRisk?.offerId).toBe("safe");
    expect(group.fastestDelivery?.offerId).toBe("safe");
    expect(group.bestForResale?.offerId).toBe("safe");
  });

  it("prefers lower risk when comparison values are similar", () => {
    const [group] = compareOffers([
      { offerId: "slightly-cheaper", supplierName: "Cheaper", currency: "USD", landedCostTotal: 100, grossMarginPercent: 30, deliveryTimeDays: 30, supplierRiskScore: 60, overallScore: 70, recommendationStatus: RecommendationStatuses.OK_WITH_RISK },
      { offerId: "safer", supplierName: "Safer", currency: "USD", landedCostTotal: 102, grossMarginPercent: 29, deliveryTimeDays: 20, supplierRiskScore: 10, overallScore: 90, recommendationStatus: RecommendationStatuses.RECOMMENDED },
    ]);

    expect(group.bestTotalCost?.offerId).toBe("safer");
    expect(group.bestForResale?.offerId).toBe("safer");
  });

  it("ignores offers that are still awaiting analysis", () => {
    const [group] = compareOffers([
      { offerId: "assessed", supplierName: "Assessed", currency: "USD", landedCostTotal: 100, grossMarginPercent: 25, deliveryTimeDays: 20, supplierRiskScore: 10, overallScore: 80, recommendationStatus: RecommendationStatuses.RECOMMENDED },
      { offerId: "pending", supplierName: "Pending", currency: "USD", landedCostTotal: 1, grossMarginPercent: 99, deliveryTimeDays: 1, supplierRiskScore: null, overallScore: null, recommendationStatus: null },
    ]);

    expect(group.offers.map((offer) => offer.offerId)).toEqual(["assessed"]);
    expect(group.bestTotalCost?.offerId).toBe("assessed");
    expect(group.fastestDelivery?.offerId).toBe("assessed");
  });

  it("excludes an offer from EUR ranking when its FX rate is unavailable", () => {
    const [group] = compareOffers([
      { offerId: "eur", supplierName: "EUR", currency: "EUR", landedCostTotal: 100, grossMarginPercent: 20, deliveryTimeDays: 20, supplierRiskScore: 10, overallScore: 80, recommendationStatus: RecommendationStatuses.RECOMMENDED },
      { offerId: "jpy", supplierName: "JPY", currency: "JPY", landedCostTotal: 1, grossMarginPercent: 90, deliveryTimeDays: 1, supplierRiskScore: 1, overallScore: 99, recommendationStatus: RecommendationStatuses.RECOMMENDED },
    ]);
    expect(group.offers.map((offer) => offer.offerId)).toEqual(["eur"]);
  });
});
