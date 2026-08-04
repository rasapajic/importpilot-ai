import { describe, expect, it } from "vitest";

import { rankLunaOffers, type LunaRankingOfferInput } from "../../modules/intelligence/domain/luna-ranking";
import { RecommendationStatuses } from "../../modules/intelligence/domain/recommendation";

function offer(
  offerId: string,
  overrides: Partial<LunaRankingOfferInput> = {},
): LunaRankingOfferInput {
  return {
    offerId,
    supplierName: `Supplier ${offerId}`,
    currency: "EUR",
    calculationStatus: "CALCULATED",
    landedCostPerUnit: 10,
    grossMarginPercent: 30,
    deliveryTimeDays: 25,
    supplierRiskScore: 20,
    overallScore: 80,
    recommendationStatus: RecommendationStatuses.RECOMMENDED,
    ...overrides,
  };
}

describe("Luna landed-cost ranking", () => {
  it("ranks only confirmed offers and preserves explainable priority", () => {
    const result = rankLunaOffers([
      offer("recommended", { overallScore: 80, grossMarginPercent: 25 }),
      offer("risk", {
        overallScore: 95,
        grossMarginPercent: 50,
        recommendationStatus: RecommendationStatuses.OK_WITH_RISK,
      }),
    ], 25);

    expect(result.ranked.map((item) => item.offerId)).toEqual(["recommended", "risk"]);
    expect(result.ranked[0]).toMatchObject({ rank: 1, status: "RANKED" });
    expect(result.ranked[0].reasonCodes).toContain("TOP_CONFIRMED_OFFER");
    expect(result.ranked[0].reasonCodes).toContain("TARGET_MARGIN_MET");
  });

  it("keeps unconfirmed calculations outside the final ranking", () => {
    const result = rankLunaOffers([
      offer("confirmed"),
      offer("review", { calculationStatus: "NEEDS_REVIEW", overallScore: 99 }),
    ], 25);

    expect(result.ranked.map((item) => item.offerId)).toEqual(["confirmed"]);
    expect(result.needsReview.map((item) => item.offerId)).toEqual(["review"]);
    expect(result.needsReview[0].rank).toBeNull();
    expect(result.needsReview[0].reasonCodes).toEqual(["UNCONFIRMED_COST_ASSUMPTIONS"]);
  });

  it("does not rank offers with missing assessment or unavailable FX", () => {
    const result = rankLunaOffers([
      offer("missing-assessment", {
        overallScore: null,
        recommendationStatus: null,
        supplierRiskScore: null,
      }),
      offer("missing-fx", { currency: "JPY" }),
    ], 25);

    expect(result.ranked).toEqual([]);
    expect(result.notReady).toHaveLength(2);
    expect(result.notReady.find((item) => item.offerId === "missing-assessment")?.missingData)
      .toEqual(expect.arrayContaining(["ASSESSMENT", "SUPPLIER_RISK"]));
    expect(result.notReady.find((item) => item.offerId === "missing-fx")?.missingData)
      .toContain("FX_RATE");
  });

  it("uses converted unit cost as a deterministic tie-break", () => {
    const result = rankLunaOffers([
      offer("usd", { currency: "USD", landedCostPerUnit: 10 }),
      offer("eur", { currency: "EUR", landedCostPerUnit: 9.5 }),
    ], 25, {
      baseCurrency: "EUR",
      ratesToEur: { EUR: 1, USD: 0.9 },
      source: "test",
      timestamp: "2026-08-04T00:00:00.000Z",
    });

    expect(result.ranked.map((item) => item.offerId)).toEqual(["usd", "eur"]);
    expect(result.ranked[0].landedCostPerUnitEur).toBe(9);
    expect(result.ranked[0].reasonCodes).toContain("LOWEST_CONFIRMED_COST");
  });
});
