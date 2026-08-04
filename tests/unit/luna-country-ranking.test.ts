import { describe, expect, it } from "vitest";

import {
  LUNA_COUNTRY_RANKING_VERSION,
  rankOffersForCountry,
  type LunaCountryRankingOfferInput,
} from "../../modules/intelligence/domain/luna-country-ranking";
import { RecommendationStatuses } from "../../modules/intelligence/domain/recommendation";

function offer(
  offerId: string,
  overrides: Partial<LunaCountryRankingOfferInput> = {},
): LunaCountryRankingOfferInput {
  return {
    offerId,
    supplierName: `Supplier ${offerId}`,
    currency: "EUR",
    calculationTargetCountry: "RS",
    calculationStatus: "CALCULATED",
    landedCostPerUnit: 15,
    grossMarginPercent: 30,
    supplierRiskScore: 20,
    overallScore: 80,
    confidenceScore: 90,
    deliveryTimeDays: 25,
    recommendationStatus: RecommendationStatuses.RECOMMENDED,
    ...overrides,
  };
}

describe("Luna country-aware ranking", () => {
  it("ranks verified offers deterministically and marks one top pick", () => {
    const first = rankOffersForCountry({
      targetCountry: "RS",
      targetMarginPercent: 25,
      offers: [
        offer("economical", { landedCostPerUnit: 14, grossMarginPercent: 35 }),
        offer("risky", { landedCostPerUnit: 13, grossMarginPercent: 36, supplierRiskScore: 70 }),
        offer("expensive", { landedCostPerUnit: 18, grossMarginPercent: 26 }),
      ],
    });
    const second = rankOffersForCountry({
      targetCountry: "RS",
      targetMarginPercent: 25,
      offers: [
        offer("economical", { landedCostPerUnit: 14, grossMarginPercent: 35 }),
        offer("risky", { landedCostPerUnit: 13, grossMarginPercent: 36, supplierRiskScore: 70 }),
        offer("expensive", { landedCostPerUnit: 18, grossMarginPercent: 26 }),
      ],
    });

    expect(first).toEqual(second);
    expect(first[0].offerId).toBe("economical");
    expect(first[0].status).toBe("TOP_PICK");
    expect(first[0].rank).toBe(1);
    expect(first[0].version).toBe(LUNA_COUNTRY_RANKING_VERSION);
    expect(first[0].reasons).toContain("COUNTRY_MATCH");
  });

  it.each(["RS", "AT", "DE"] as const)("uses a confirmed calculation for %s", (countryCode) => {
    const [ranked] = rankOffersForCountry({
      targetCountry: countryCode,
      targetMarginPercent: 25,
      offers: [offer(countryCode, { calculationTargetCountry: countryCode })],
    });

    expect(ranked.status).toBe("TOP_PICK");
    expect(ranked.targetCountry).toBe(countryCode);
    expect(ranked.score).not.toBeNull();
  });

  it("blocks a calculation created for a different country", () => {
    const [ranked] = rankOffersForCountry({
      targetCountry: "AT",
      targetMarginPercent: 25,
      offers: [offer("wrong-country", { calculationTargetCountry: "DE" })],
    });

    expect(ranked.status).toBe("REVIEW_REQUIRED");
    expect(ranked.score).toBeNull();
    expect(ranked.reasons).toEqual(["COUNTRY_MISMATCH"]);
  });

  it("does not select a NEEDS_REVIEW calculation as the winner", () => {
    const ranking = rankOffersForCountry({
      targetCountry: "DE",
      targetMarginPercent: 25,
      offers: [
        offer("confirmed", { calculationTargetCountry: "DE", landedCostPerUnit: 17 }),
        offer("unconfirmed-cheap", {
          calculationTargetCountry: "DE",
          calculationStatus: "NEEDS_REVIEW",
          landedCostPerUnit: 5,
          grossMarginPercent: 80,
        }),
      ],
    });

    expect(ranking[0].offerId).toBe("confirmed");
    expect(ranking[0].status).toBe("TOP_PICK");
    expect(ranking[1].offerId).toBe("unconfirmed-cheap");
    expect(ranking[1].status).toBe("REVIEW_REQUIRED");
    expect(ranking[1].score).toBeNull();
  });

  it("marks offers without calculation or assessment as incomplete", () => {
    const ranking = rankOffersForCountry({
      targetCountry: "RS",
      targetMarginPercent: 25,
      offers: [
        offer("no-cost", {
          calculationTargetCountry: null,
          calculationStatus: null,
          landedCostPerUnit: null,
          grossMarginPercent: null,
        }),
        offer("no-assessment", {
          supplierRiskScore: null,
          overallScore: null,
          confidenceScore: null,
          recommendationStatus: null,
        }),
      ],
    });

    expect(ranking.map((item) => item.status)).toEqual(["INCOMPLETE", "INCOMPLETE"]);
    expect(ranking.flatMap((item) => item.reasons)).toEqual([
      "MISSING_CALCULATION",
      "MISSING_ASSESSMENT",
    ]);
  });

  it("compares mixed currencies through the provided EUR snapshot", () => {
    const ranking = rankOffersForCountry({
      targetCountry: "RS",
      targetMarginPercent: 25,
      offers: [
        offer("eur", { landedCostPerUnit: 15, currency: "EUR" }),
        offer("usd", { landedCostPerUnit: 16, currency: "USD" }),
      ],
    }, {
      baseCurrency: "EUR",
      ratesToEur: { EUR: 1, USD: 0.9 },
      source: "test",
      timestamp: "2026-08-04T00:00:00.000Z",
    });

    expect(ranking[0].offerId).toBe("usd");
    expect(ranking[0].landedCostPerUnitEur).toBe(14.4);
    expect(ranking[0].reasons).toContain("LOWEST_LANDED_COST");
  });
});
