import { describe, expect, it } from "vitest";

import {
  calculateProfitabilityRecovery,
  ProfitabilityRecoveryActions,
  type ProfitabilityRecoveryInput,
} from "../../modules/cost-engine/domain/profitability-recovery";

function input(overrides: Partial<ProfitabilityRecoveryInput> = {}): ProfitabilityRecoveryInput {
  return {
    targetCountry: "RS",
    quantity: 100,
    currentSupplierUnitPrice: "5.00",
    currency: "USD",
    incoterm: "EXW",
    shippingCost: "200.00",
    customsDutyRate: "5.0000",
    vatRate: "20.0000",
    storageCost: "0.00",
    inspectionCost: "0.00",
    customsBrokerCost: "50.00",
    otherCosts: "0.00",
    targetSellingPrice: "10.00",
    currentLandedCostPerUnit: "9.42",
    currentGrossMarginPercent: "5.8000",
    targetMarginPercent: "25.00",
    ...overrides,
  };
}

describe("profitability recovery", () => {
  it("calculates the recovery thresholds for the three-offer trunk organizer test", () => {
    const result = calculateProfitabilityRecovery(input());

    expect(result.maximumLandedCostPerUnit).toBe("7.50");
    expect(result.minimumSellingPrice).toBe("12.56");
    expect(result.maximumSupplierUnitPrice).toBe("3.4801");
    expect(result.supplierReductionAmount).toBe("1.52");
    expect(result.supplierReductionPercent).toBe("30.4");
    expect(result.sellingPriceIncreaseAmount).toBe("2.56");
    expect(result.sellingPriceIncreasePercent).toBe("25.6");
    expect(result.action).toBe(ProfitabilityRecoveryActions.FIND_NEW_OFFERS);
  });

  it("recommends supplier negotiation when a modest price reduction reaches the target", () => {
    const result = calculateProfitabilityRecovery(input({
      currentSupplierUnitPrice: "8.00",
      shippingCost: "0.00",
      customsDutyRate: "0",
      vatRate: "0",
      customsBrokerCost: "0.00",
      currentLandedCostPerUnit: "8.00",
      currentGrossMarginPercent: "20.0000",
    }));

    expect(result.maximumSupplierUnitPrice).toBe("7.5000");
    expect(result.supplierReductionPercent).toBe("6.3");
    expect(result.action).toBe(ProfitabilityRecoveryActions.NEGOTIATE_SUPPLIER);
  });

  it("recommends a selling-price increase when supplier reduction would be excessive", () => {
    const result = calculateProfitabilityRecovery(input({
      currentSupplierUnitPrice: "2.00",
      shippingCost: "600.00",
      customsDutyRate: "0",
      vatRate: "0",
      customsBrokerCost: "0.00",
      currentLandedCostPerUnit: "8.00",
      currentGrossMarginPercent: "20.0000",
    }));

    expect(result.maximumSupplierUnitPrice).toBe("1.5000");
    expect(result.supplierReductionPercent).toBe("25.0");
    expect(result.sellingPriceIncreasePercent).toBe("6.7");
    expect(result.action).toBe(ProfitabilityRecoveryActions.RAISE_SELLING_PRICE);
  });

  it("does not propose changes when the target margin is already reached", () => {
    const result = calculateProfitabilityRecovery(input({
      currentLandedCostPerUnit: "7.50",
      currentGrossMarginPercent: "25.0000",
    }));

    expect(result.action).toBe(ProfitabilityRecoveryActions.TARGET_MET);
    expect(result.supplierReductionAmount).toBe("0.00");
    expect(result.sellingPriceIncreaseAmount).toBe("0.00");
  });
});
