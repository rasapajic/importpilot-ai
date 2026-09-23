import { describe, expect, it } from "vitest";

import { toSerbianLatin } from "../../modules/i18n/serbian-latin";
import { translateBusinessText, translateText } from "../../modules/i18n/translations";

describe("Serbian Latin-only display", () => {
  it("transliterates Serbian Cyrillic without changing numbers or punctuation", () => {
    expect(toSerbianLatin("ЛЕД лампе соларне за башту — 10 ком.")).toBe(
      "LED lampe solarne za baštu — 10 kom.",
    );
  });

  it("uses Latin script for arbitrary Serbian UI content", () => {
    expect(translateText("Пронађене понуде", "sr")).toBe("Pronađene ponude");
    expect(translateBusinessText("Цена није преузета", "sr")).toBe("Cena nije preuzeta");
  });

  it("does not transliterate content in German or English UI", () => {
    expect(translateText("ЛЕД лампе", "de")).toBe("ЛЕД лампе");
  });
});
