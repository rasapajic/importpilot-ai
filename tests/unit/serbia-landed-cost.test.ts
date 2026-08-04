import { describe, expect, it } from "vitest";

import {
  getLatestCostAssumptionsByOffer,
  readSerbiaLandedCostAssumptions,
  requiresSerbiaCostReview,
  SERBIA_LANDED_COST_VERSION,
  sumCostAmounts,
  totalSerbiaTransportCost,
} from "../../modules/cost-engine/domain/serbia-landed-cost";

const assumptions = {
  version: SERBIA_LANDED_COST_VERSION,
  chinaDomesticTransportCost: "50.00",
  internationalTransportCost: "100.00",
  insuranceCost: "10.00",
  customsBrokerCost: "40.00",
  otherCosts: "10.00",
  transportConfirmed: true,
  customsDutyConfirmed: true,
  vatSource: "SERBIA_DEFAULT_20" as const,
};

describe("Serbia landed cost assumptions", () => {
  it("sums transport components without floating point arithmetic", () => {
    expect(totalSerbiaTransportCost(assumptions)).toBe("160.00");
    expect(sumCostAmounts(["0.10", "0.20", "0.30"])).toBe("0.60");
  });

  it("requires review until transport and customs are confirmed for Serbia", () => {
    expect(requiresSerbiaCostReview({
      targetCountry: "RS",
      transportConfirmed: false,
      customsDutyConfirmed: true,
    })).toBe(true);
    expect(requiresSerbiaCostReview({
      targetCountry: "RS",
      transportConfirmed: true,
      customsDutyConfirmed: true,
    })).toBe(false);
    expect(requiresSerbiaCostReview({
      targetCountry: "DE",
      transportConfirmed: false,
      customsDutyConfirmed: false,
    })).toBe(false);
  });

  it("restores the latest assumptions for each offer from descending activities", () => {
    const activities = [
      {
        type: "LANDED_COST_CALCULATED",
        metadata: { offerId: "offer-a", costAssumptions: assumptions },
      },
      {
        type: "LANDED_COST_CALCULATED",
        metadata: {
          offerId: "offer-a",
          costAssumptions: { ...assumptions, internationalTransportCost: "90.00" },
        },
      },
      {
        type: "OFFER_ADDED",
        metadata: { offerId: "offer-b", costAssumptions: assumptions },
      },
    ];

    expect(getLatestCostAssumptionsByOffer(activities)).toEqual({
      "offer-a": assumptions,
    });
  });

  it("rejects malformed activity metadata instead of guessing", () => {
    expect(readSerbiaLandedCostAssumptions({
      costAssumptions: { ...assumptions, insuranceCost: -1 },
    })).toBeNull();
  });
});
