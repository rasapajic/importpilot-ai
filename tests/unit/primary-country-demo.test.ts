import { describe, expect, it } from "vitest";

import { PRIMARY_IMPORT_COUNTRY_CODES } from "../../modules/cost-engine/domain/import-country-profiles";
import { buildPrimaryCountryDemoScenario } from "../../modules/cost-engine/domain/primary-country-demo";

describe("primary country landed-cost demo scenarios", () => {
  it("creates comparable scenarios for Serbia, Austria and Germany", () => {
    const scenarios = PRIMARY_IMPORT_COUNTRY_CODES.map(buildPrimaryCountryDemoScenario);

    expect(scenarios.map((scenario) => scenario.countryCode)).toEqual(["RS", "AT", "DE"]);
    expect(scenarios.map((scenario) => scenario.vatRate)).toEqual(["20", "20", "19"]);
    expect(scenarios.every((scenario) => scenario.assumptions.transportConfirmed)).toBe(true);
    expect(scenarios.every((scenario) => scenario.assumptions.customsDutyConfirmed)).toBe(true);
    expect(scenarios.every((scenario) => scenario.assumptions.vatSource === "COUNTRY_PROFILE_DEFAULT")).toBe(true);
  });

  it("keeps identical inputs comparable and exposes the VAT difference", () => {
    const serbia = buildPrimaryCountryDemoScenario("RS");
    const austria = buildPrimaryCountryDemoScenario("AT");
    const germany = buildPrimaryCountryDemoScenario("DE");

    expect(serbia.calculation.landedCostTotal).toBe(austria.calculation.landedCostTotal);
    expect(Number(germany.calculation.landedCostTotal)).toBeLessThan(Number(serbia.calculation.landedCostTotal));
    expect(serbia.calculation.shippingCost).toBe("950.00");
    expect(germany.calculation.shippingCost).toBe("950.00");
  });

  it("persists country profile identity and broker cost separately in assumptions", () => {
    const scenario = buildPrimaryCountryDemoScenario("DE");

    expect(scenario.countryProfileVersion).toBe("DE_IMPORT_PROFILE_V1");
    expect(scenario.assumptions.countryCode).toBe("DE");
    expect(scenario.assumptions.customsBrokerCost).toBe("150.00");
    expect(scenario.persistedOtherCosts).toBe("200.00");
  });
});
