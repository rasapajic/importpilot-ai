import { describe, expect, it } from "vitest";

import {
  calculateLandedCost,
  type LandedCostInput,
} from "../../modules/cost-engine/domain/calculator";

const baseInput: LandedCostInput = {
  targetCountry: "DE",
  quantity: 100,
  unitPrice: "10.0000",
  currency: "EUR",
  incoterm: "FOB",
  shippingCost: "100.00",
  customsDutyRate: "5",
  vatRate: "20",
  storageCost: "30.00",
  inspectionCost: "20.00",
  otherCosts: "10.00",
  targetSellingPrice: "20.00",
};

describe("calculateLandedCost", () => {
  it("calculates a normal landed cost deterministically", () => {
    expect(calculateLandedCost(baseInput)).toMatchObject({
      customsDutyAmount: "55.00",
      vatAmount: "237.00",
      landedCostTotal: "1452.00",
      landedCostPerUnit: "14.52",
      breakEvenPrice: "14.52",
    });
  });

  it("supports zero shipping", () => {
    const result = calculateLandedCost({
      ...baseInput,
      shippingCost: "0.00",
      customsDutyRate: "0",
      vatRate: "0",
      storageCost: "0.00",
      inspectionCost: "0.00",
      otherCosts: "0.00",
    });
    expect(result.landedCostTotal).toBe("1000.00");
    expect(result.landedCostPerUnit).toBe("10.00");
  });

  it("supports high customs duty within the validated range", () => {
    const result = calculateLandedCost({
      ...baseInput,
      shippingCost: "0.00",
      customsDutyRate: "250",
      vatRate: "0",
      storageCost: "0.00",
      inspectionCost: "0.00",
      otherCosts: "0.00",
    });
    expect(result.customsDutyAmount).toBe("2500.00");
    expect(result.landedCostTotal).toBe("3500.00");
  });

  it("rejects negative values", () => {
    expect(() => calculateLandedCost({ ...baseInput, shippingCost: "-1.00" })).toThrow();
    expect(() => calculateLandedCost({ ...baseInput, quantity: -1 })).toThrow();
  });

  it("rejects values outside the persisted numeric range", () => {
    expect(() =>
      calculateLandedCost({ ...baseInput, shippingCost: "999999999999999999.99" }),
    ).toThrow("opsega");
  });

  it("calculates gross margin from selling price and landed cost per unit", () => {
    expect(calculateLandedCost(baseInput).grossMarginPercent).toBe("27.4000");
  });

  it("rounds half-up after multiplying precise unit price by quantity", () => {
    const result = calculateLandedCost({
      ...baseInput,
      quantity: 3,
      unitPrice: "0.3333",
      shippingCost: "0.00",
      customsDutyRate: "0",
      vatRate: "0",
      storageCost: "0.00",
      inspectionCost: "0.00",
      otherCosts: "0.00",
      targetSellingPrice: "1.00",
    });
    expect(result.landedCostTotal).toBe("1.00");
    expect(result.landedCostPerUnit).toBe("0.33");
    expect(result.grossMarginPercent).toBe("67.0000");
  });
});
