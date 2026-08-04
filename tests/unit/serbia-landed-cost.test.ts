import { describe, expect, it } from "vitest";

import { getImportCountryProfile } from "../../modules/cost-engine/domain/import-country-profiles";
import {
  createLandedCostAssumptions,
  getLatestCostAssumptionsByOffer,
  readLandedCostAssumptions,
  requiresImportCostReview,
  sumCostAmounts,
  totalImportTransportCost,
} from "../../modules/cost-engine/domain/serbia-landed-cost";

const assumptions = createLandedCostAssumptions({
  countryCode: "RS",
  chinaDomesticTransportCost: "50.00",
  internationalTransportCost: "100.00",
  insuranceCost: "10.00",
  customsBrokerCost: "40.00",
  otherCosts: "10.00",
  transportConfirmed: true,
  customsDutyConfirmed: true,
  vatSource: "COUNTRY_PROFILE_DEFAULT",
});

describe("primary-market landed cost assumptions", () => {
  it("defines versioned profiles for Serbia, Austria and Germany", () => {
    expect(getImportCountryProfile("RS")).toMatchObject({ defaultVatRate: "20" });
    expect(getImportCountryProfile("AT")).toMatchObject({ defaultVatRate: "20" });
    expect(getImportCountryProfile("DE")).toMatchObject({ defaultVatRate: "19" });
    expect(getImportCountryProfile("FR")).toBeNull();
  });

  it("sums transport components without floating point arithmetic", () => {
    expect(totalImportTransportCost(assumptions)).toBe("160.00");
    expect(sumCostAmounts(["0.10", "0.20", "0.30"])).toBe("0.60");
  });

  it("requires confirmation for all three primary import countries", () => {
    for (const targetCountry of ["RS", "AT", "DE"]) {
      expect(requiresImportCostReview({
        targetCountry,
        transportConfirmed: false,
        customsDutyConfirmed: true,
      })).toBe(true);
      expect(requiresImportCostReview({
        targetCountry,
        transportConfirmed: true,
        customsDutyConfirmed: true,
      })).toBe(false);
    }
    expect(requiresImportCostReview({
      targetCountry: "FR",
      transportConfirmed: false,
      customsDutyConfirmed: false,
    })).toBe(false);
  });

  it("requires review when a profile-default VAT value does not match the country profile", () => {
    expect(requiresImportCostReview({
      targetCountry: "DE",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      vatRate: "20",
      vatSource: "COUNTRY_PROFILE_DEFAULT",
    })).toBe(true);
    expect(requiresImportCostReview({
      targetCountry: "DE",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      vatRate: "19",
      vatSource: "COUNTRY_PROFILE_DEFAULT",
    })).toBe(false);
    expect(requiresImportCostReview({
      targetCountry: "DE",
      transportConfirmed: true,
      customsDutyConfirmed: true,
      vatRate: "20",
      vatSource: "MANUAL_OVERRIDE",
    })).toBe(false);
  });

  it("restores the latest versioned assumptions for each offer", () => {
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
    ];

    expect(getLatestCostAssumptionsByOffer(activities)).toEqual({
      "offer-a": assumptions,
    });
  });

  it("normalizes legacy Serbia metadata without losing the cost breakdown", () => {
    const legacy = readLandedCostAssumptions({
      costAssumptions: {
        version: "SERBIA_LANDED_COST_V1",
        chinaDomesticTransportCost: "50.00",
        internationalTransportCost: "100.00",
        insuranceCost: "10.00",
        customsBrokerCost: "40.00",
        otherCosts: "10.00",
        transportConfirmed: true,
        customsDutyConfirmed: true,
        vatSource: "SERBIA_DEFAULT_20",
      },
    });
    expect(legacy).toMatchObject({
      countryCode: "RS",
      vatSource: "COUNTRY_PROFILE_DEFAULT",
      internationalTransportCost: "100.00",
    });
  });

  it("rejects malformed activity metadata instead of guessing", () => {
    expect(readLandedCostAssumptions({
      costAssumptions: { ...assumptions, insuranceCost: -1 },
    })).toBeNull();
  });
});
