import { describe, expect, it } from "vitest";

import {
  getAutomaticVatRate,
  resolveVatRate,
  VAT_RATES_BY_COUNTRY,
} from "../../modules/cost-engine/domain/vat-rates";

describe("automatic VAT rates", () => {
  it("returns the configured VAT rate for supported target countries", () => {
    expect(getAutomaticVatRate("DE")).toBe("19");
    expect(getAutomaticVatRate("AT")).toBe("20");
    expect(getAutomaticVatRate("RS")).toBe("20");
    expect(getAutomaticVatRate("HU")).toBe("27");
    expect(getAutomaticVatRate("lu")).toBe("17");
    expect(Object.keys(VAT_RATES_BY_COUNTRY)).toHaveLength(26);
  });

  it("returns null for an unsupported target country", () => {
    expect(getAutomaticVatRate("CH")).toBeNull();
    expect(getAutomaticVatRate("")).toBeNull();
  });

  it("uses a manual override when one is provided", () => {
    expect(resolveVatRate("DE", "7.5")).toBe("7.5");
    expect(resolveVatRate("CH", "20")).toBe("20");
  });

  it("uses the automatic rate when manual override is empty", () => {
    expect(resolveVatRate("NL", "")).toBe("21");
    expect(resolveVatRate("FR", null)).toBe("20");
  });
});
