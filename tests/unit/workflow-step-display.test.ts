import { describe, expect, it } from "vitest";

import {
  getDecisionStepBadge,
  getOfferStepDisplay,
  getProductStepDisplay,
} from "../../modules/projects/domain/workflow-step-display";

describe("workflow step display", () => {
  it("describes the selected product instead of repeating the question", () => {
    expect(getProductStepDisplay("COMPLETED", "sr")).toEqual({
      title: "Odabrani proizvod",
      badge: "ODABRANO",
    });
    expect(getProductStepDisplay("ACTIVE", "sr")).toEqual({
      title: "Šta želite da kupite?",
      badge: "IZABERI PROIZVOD",
    });
  });

  it("uses meaningful offer and decision badges", () => {
    expect(getOfferStepDisplay("COMPLETED", "sr")).toEqual({
      title: "Ponude dobavljača",
      badge: "PONUDE DODATE",
    });
    expect(getDecisionStepBadge("COMPLETED", "sr")).toBe("ODLUKA DONETA");
  });

  it("localizes completed workflow states", () => {
    expect(getProductStepDisplay("COMPLETED", "de").title).toBe("Ausgewähltes Produkt");
    expect(getOfferStepDisplay("COMPLETED", "en").badge).toBe("OFFERS ADDED");
    expect(getDecisionStepBadge("COMPLETED", "de")).toBe("ENTSCHEIDUNG GETROFFEN");
  });
});
