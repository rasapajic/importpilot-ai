import { describe, expect, it } from "vitest";

import {
  getDecisionStepBadge,
  getOfferStepDisplay,
  getProductStepDisplay,
} from "../../modules/projects/domain/workflow-step-display";

describe("workflow step display", () => {
  it("uses demand wording before confirmation and a neutral product title afterwards", () => {
    expect(getProductStepDisplay("COMPLETED", "sr")).toEqual({
      title: "Proizvod",
      badge: "POTVRĐENO",
    });
    expect(getProductStepDisplay("ACTIVE", "sr")).toEqual({
      title: "Koji proizvod tražite?",
      badge: "UNESITE PROIZVOD",
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
    expect(getProductStepDisplay("COMPLETED", "de")).toEqual({
      title: "Produkt",
      badge: "BESTÄTIGT",
    });
    expect(getOfferStepDisplay("COMPLETED", "en").badge).toBe("OFFERS ADDED");
    expect(getDecisionStepBadge("COMPLETED", "de")).toBe("ENTSCHEIDUNG GETROFFEN");
  });
});
