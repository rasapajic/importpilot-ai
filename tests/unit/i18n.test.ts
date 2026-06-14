import { describe, expect, it } from "vitest";

import {
  getStatusLabel,
  resolveLocale,
  translateBusinessText,
  translateText,
} from "../../modules/i18n/translations";

describe("i18n foundation", () => {
  it("falls back to English for an unsupported or missing locale", () => {
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
    expect(translateText("Nova kupovina", "fr")).toBe("New purchase");
  });

  it("maps decision statuses without changing their internal values", () => {
    expect(getStatusLabel("READY_TO_BUY", "en")).toBe("BUY");
    expect(getStatusLabel("READY_TO_BUY", "de")).toBe("KAUFEN");
    expect(getStatusLabel("READY_TO_BUY", "sr")).toBe("KUPI");
    expect(getStatusLabel("NEGOTIATE_FIRST", "en")).toBe("NEGOTIATE");
    expect(getStatusLabel("NEGOTIATE_FIRST", "de")).toBe("VERHANDELN");
    expect(getStatusLabel("DO_NOT_BUY", "sr")).toBe("PRESKOČI");
  });

  it("keeps unknown business values unchanged", () => {
    expect(getStatusLabel("CUSTOM_STATUS", "de")).toBe("CUSTOM_STATUS");
    expect(translateText("Shenzhen Nova Trading", "de")).toBe("Shenzhen Nova Trading");
  });

  it("localizes dynamic decision text and never exposes internal decision enums", () => {
    expect(translateBusinessText("Uzorak nije potvrđen za najbolju dostupnu ponudu.", "en"))
      .toBe("Sample not verified for the best available offer.");
    expect(translateBusinessText("Imate 4 ponuda, ali 2 su direktno uporedive u valuti EUR.", "en"))
      .toBe("You have 4 offers, but only 2 are directly comparable in EUR.");
    expect(getStatusLabel("DO_NOT_BUY", "en")).not.toContain("DO_NOT_BUY");
    expect(translateText("[DEMO] Mini grejalice — DO_NOT_BUY", "en"))
      .toBe("[DEMO] Mini grejalice — SKIP");
  });

  it("localizes target margin consistently", () => {
    expect(translateText("Ciljna marža", "en")).toBe("Target margin");
    expect(translateText("Ciljna marža", "de")).toBe("Zielmarge");
    expect(translateText("Target margin", "sr")).toBe("Ciljna marža");
  });

  it("uses user-friendly offer labels without changing internal enums", () => {
    expect(getStatusLabel("MANUAL", "sr")).toBe("Ručni unos");
    expect(getStatusLabel("NOT_RECOMMENDED", "sr")).toBe("PRESKOČI");
    expect(getStatusLabel("NOT_RECOMMENDED", "en")).toBe("SKIP");
    expect(translateText("Očekivana marža", "de")).toBe("Erwartete Marge");
    expect(translateText("Minimalna količina (MOQ)", "en")).toBe("Minimum quantity (MOQ)");
    expect(translateText("kom", "de")).toBe("Stk.");
  });

  it("explains MOQ in dynamic recommendation text", () => {
    expect(translateBusinessText("Pre odluke: pregovarajte o nižem MOQ-u.", "sr"))
      .toBe("Pre odluke: pregovarajte o nižoj minimalnoj količini (MOQ).");
    expect(translateBusinessText("Pre odluke: pregovarajte o nižem MOQ-u.", "en"))
      .toContain("minimum order quantity (MOQ)");
  });

  it("localizes specific URL import failures", () => {
    expect(translateText("Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda.", "en"))
      .toBe("Alibaba is currently blocking automatic import for this product.");
    expect(translateText("Nismo uspeli da pronađemo podatke o proizvodu na ovoj stranici.", "de"))
      .toBe("Wir konnten auf dieser Seite keine Produktdaten finden.");
    expect(translateText("Link nije prepoznat kao Alibaba ili Made-in-China proizvod.", "en"))
      .toBe("The link was not recognized as an Alibaba or Made-in-China product.");
    expect(translateText("Došlo je do mrežne greške. Pokušajte ponovo.", "de"))
      .toBe("Es ist ein Netzwerkfehler aufgetreten. Bitte versuchen Sie es erneut.");
  });

  it("localizes URL import manual fallback actions", () => {
    expect(translateText("Nastavite ručno bez ponovnog pokretanja.", "en"))
      .toBe("Continue manually without starting over.");
    expect(translateText("Link će ostati sačuvan kao izvor ponude.", "de"))
      .toBe("Der Link bleibt als Angebotsquelle gespeichert.");
    expect(translateText("Nastavi ručno", "en")).toBe("Continue manually");
  });

  it("localizes partial URL extraction state", () => {
    expect(translateText("Delimično prepoznati podaci", "en")).toBe("Partially recognized data");
    expect(translateText("Delimično prepoznati podaci", "de")).toBe("Teilweise erkannte Daten");
    expect(translateText("Naziv proizvoda procenjen iz linka", "en")).toBe("Product name estimated from the link");
  });
});
