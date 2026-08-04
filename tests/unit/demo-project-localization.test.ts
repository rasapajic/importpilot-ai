import { describe, expect, it } from "vitest";

import { translateText } from "../../modules/i18n/translations";

describe("demo project localization", () => {
  it("shows primary-country demo projects without Serbian or technical titles in German", () => {
    expect(translateText("[DEMO][LANDED-COST][DE] Pametni organizatori", "de"))
      .toBe("Demo · Deutschland · Smarte Aufbewahrungsorganizer");
    expect(translateText("[DEMO][LANDED-COST][AT] Pametni organizatori", "de"))
      .toBe("Demo · Österreich · Smarte Aufbewahrungsorganizer");
    expect(translateText("[DEMO][LANDED-COST][RS] Pametni organizatori", "de"))
      .toBe("Demo · Serbien · Smarte Aufbewahrungsorganizer");
  });

  it("localizes the standard demo catalogue in all supported languages", () => {
    const source = "[DEMO] Električni čajnici — READY_TO_BUY";
    expect(translateText(source, "sr")).toBe("Demo · Električni čajnici · KUPI");
    expect(translateText(source, "de")).toBe("Demo · Elektrische Wasserkocher · KAUFEN");
    expect(translateText(source, "en")).toBe("Demo · Electric kettles · BUY");
  });

  it("never translates a real user-entered project name", () => {
    expect(translateText("Merimin uvoz za lokal", "de")).toBe("Merimin uvoz za lokal");
  });
});
