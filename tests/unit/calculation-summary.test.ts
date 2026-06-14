import { describe, expect, it } from "vitest";

import {
  formatDisplayedPercent,
  getDisplayedProfitSummary,
} from "../../modules/cost-engine/application/calculation-summary";
import { translateBusinessText } from "../../modules/i18n/translations";

describe("calculation summary display", () => {
  it("rounds displayed percentages to one decimal without changing stored precision", () => {
    const stored = "39.4545";
    expect(formatDisplayedPercent(stored)).toBe("39.5");
    expect(stored).toBe("39.4545");
  });

  it("calculates displayed profit per unit and total expected profit", () => {
    expect(getDisplayedProfitSummary({
      targetSellingPrice: "20.00",
      landedCostPerUnit: "14.52",
      quantity: 100,
    })).toEqual({
      profitPerUnit: "5.48",
      totalProfit: "548.00",
    });
  });

  it("translates profit labels", () => {
    expect(translateBusinessText("Zarada po komadu", "en")).toBe("Profit per unit");
    expect(translateBusinessText("Ukupna očekivana zarada", "de")).toBe("Erwarteter Gesamtgewinn");
  });
});
