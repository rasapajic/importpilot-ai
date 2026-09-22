import { describe, expect, it } from "vitest";

import { parseVoiceSearchIntake } from "../../modules/product-search/domain/voice-search-intake";

describe("JAKOV360 voice search intake", () => {
  it("extracts Serbian Latin product, quantity and destination without confusing product wattage", () => {
    expect(
      parseVoiceSearchIntake(
        "Tražim 100 komada GaN punjača 65 W za Austriju.",
        "sr",
      ),
    ).toEqual({
      product: "GaN punjača 65 W",
      quantity: 100,
      targetCountry: "AT",
    });
  });

  it("supports Serbian Cyrillic speech transcripts and spoken number words", () => {
    expect(
      parseVoiceSearchIntake(
        "Тражим сто комада GaN пуњача 65 W за Аустрију.",
        "sr",
      ),
    ).toEqual({
      product: "GaN пуњача 65 W",
      quantity: 100,
      targetCountry: "AT",
    });
  });

  it("extracts German compound number words and destination", () => {
    expect(
      parseVoiceSearchIntake(
        "Ich suche zweihundert Stück USB-C Ladegeräte 65 W für Deutschland.",
        "de",
      ),
    ).toEqual({
      product: "USB-C Ladegeräte 65 W",
      quantity: 200,
      targetCountry: "DE",
    });
  });

  it("extracts English quantity words and destination", () => {
    expect(
      parseVoiceSearchIntake(
        "I need one hundred pieces USB-C chargers 65W for Germany.",
        "en",
      ),
    ).toEqual({
      product: "USB-C chargers 65W",
      quantity: 100,
      targetCountry: "DE",
    });
  });

  it("leaves fields unknown when speech did not contain them", () => {
    expect(
      parseVoiceSearchIntake("GaN charger 65W for Austria", "en"),
    ).toEqual({
      product: "GaN charger 65W",
      quantity: null,
      targetCountry: "AT",
    });
  });

  it("parses numeric quantities with Cyrillic quantity units", () => {
    expect(
      parseVoiceSearchIntake("Тражим 1.000 комада каблова за Србију", "sr"),
    ).toEqual({
      product: "каблова",
      quantity: 1000,
      targetCountry: "RS",
    });
  });
});
