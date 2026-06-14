import { describe, expect, it } from "vitest";

import { convertToEur, getEuroDisplay, type FxSnapshot } from "../../modules/fx/euro-display";

const fx: FxSnapshot = {
  baseCurrency: "EUR",
  ratesToEur: { EUR: 1, USD: 0.9 },
  source: "Test rates",
  timestamp: "2026-06-14T00:00:00.000Z",
};

describe("EUR presentation conversion", () => {
  it("converts USD to EUR", () => {
    expect(convertToEur(10, "USD", fx)).toBe(9);
    expect(getEuroDisplay(10, "USD", fx)).toMatchObject({
      original: "10.00 USD",
      eur: "9.00 EUR",
      converted: true,
    });
  });

  it("keeps EUR as EUR", () => {
    expect(getEuroDisplay(10, "EUR", fx)).toMatchObject({
      original: "10.00 EUR",
      eur: "10.00 EUR",
      converted: false,
    });
  });

  it("falls back to original currency when FX is missing", () => {
    expect(getEuroDisplay(10, "JPY", fx)).toEqual({
      original: "10.00 JPY",
      eur: null,
      converted: false,
    });
  });
});
