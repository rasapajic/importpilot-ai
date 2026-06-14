import { describe, expect, it } from "vitest";

import {
  getCountryDisplayName,
  normalizeTargetCountryCode,
} from "../../modules/i18n/country-names";

describe("country display names", () => {
  it("maps the existing SR business code to Serbia instead of Suriname", () => {
    expect(getCountryDisplayName("SR", "sr")).toBe("Srbija");
    expect(getCountryDisplayName("SR", "de")).toBe("Serbien");
    expect(getCountryDisplayName("SR", "en")).toBe("Serbia");
  });

  it("uses localized region names for standard country codes", () => {
    expect(getCountryDisplayName("DE", "sr")).toBe("Nemačka");
    expect(getCountryDisplayName("AT", "de")).toBe("Österreich");
  });

  it("normalizes the legacy Serbia code to the ISO RS code", () => {
    expect(normalizeTargetCountryCode("SR")).toBe("RS");
    expect(normalizeTargetCountryCode("rs")).toBe("RS");
    expect(normalizeTargetCountryCode("DE")).toBe("DE");
  });
});
