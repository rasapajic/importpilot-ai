import { describe, expect, it } from "vitest";

import { getSimplifiedNextActions } from "../../modules/decisions/application/simplified-next-actions";

describe("simplified next actions", () => {
  it("returns purchase actions for KUPI", () => {
    expect(getSimplifiedNextActions("READY_TO_BUY")).toEqual([
      "Zatraži uzorak",
      "Kontaktiraj dobavljača",
      "Izvezi PDF",
    ]);
  });

  it("returns negotiation actions for PREGOVARAJ", () => {
    expect(getSimplifiedNextActions("NEGOTIATE_FIRST")).toEqual([
      "Predloži poruku",
      "Traži bolju cenu",
      "Traži manji MOQ",
      "Izvezi PDF",
    ]);
  });

  it("leaves the unprofitable action to the recovery panel", () => {
    expect(getSimplifiedNextActions("DO_NOT_BUY")).toEqual([]);
  });
});
