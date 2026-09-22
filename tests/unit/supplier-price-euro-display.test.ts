import { describe, expect, it } from "vitest";

import {
  formatSupplierOrderTotalWithEuro,
  formatSupplierPriceWithEuro,
} from "../../components/search/simple-supplier-offer-search";
import type { FxSnapshot } from "../../modules/fx/euro-display";

const fxSnapshot: FxSnapshot = {
  baseCurrency: "EUR",
  ratesToEur: { EUR: 1, USD: 0.9 },
  source: "Test FX",
  timestamp: "2026-09-22T00:00:00.000Z",
};

function normalizeSpaces(value: string) {
  return value.replace(/\s/g, " ");
}

describe("supplier price EUR display", () => {
  it("keeps the original USD unit price and adds its approximate EUR value", () => {
    const display = normalizeSpaces(formatSupplierPriceWithEuro(6.5, "USD", "sr", fxSnapshot));
    expect(display).toContain("6,50 US$");
    expect(display).toContain("≈ 5,85 €");
  });

  it("uses the same conversion for the requested-order total", () => {
    const display = normalizeSpaces(formatSupplierOrderTotalWithEuro(650, "USD", "sr", fxSnapshot));
    expect(display).toContain("650 US$");
    expect(display).toContain("≈ 585 €");
  });

  it("does not duplicate EUR or invent a conversion without a fresh snapshot", () => {
    expect(formatSupplierPriceWithEuro(6.5, "EUR", "sr", fxSnapshot)).not.toContain("≈");
    expect(formatSupplierPriceWithEuro(6.5, "USD", "sr", null)).not.toContain("≈");
  });
});
