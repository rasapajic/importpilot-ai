import { describe, expect, it } from "vitest";

import { getDashboardProjectStage } from "../../modules/projects/application/dashboard-project-stage";
import { translateText } from "../../modules/i18n/translations";

describe("dashboard project stage", () => {
  it("maps project progress to compact workflow labels", () => {
    expect(getDashboardProjectStage({
      offerCount: 0,
      hasAssessment: false,
      latestDecisionStatus: null,
    })).toBe("Traženje ponuda");
    expect(getDashboardProjectStage({
      offerCount: 2,
      hasAssessment: false,
      latestDecisionStatus: null,
    })).toBe("Ponude pronađene");
    expect(getDashboardProjectStage({
      offerCount: 2,
      hasAssessment: true,
      latestDecisionStatus: "NEED_MORE_OFFERS",
    })).toBe("Čeka analizu");
    expect(getDashboardProjectStage({
      offerCount: 2,
      hasAssessment: true,
      latestDecisionStatus: "READY_TO_BUY",
    })).toBe("Odluka spremna");
  });

  it("localizes workflow labels", () => {
    expect(translateText("Traženje ponuda", "en")).toBe("Searching offers");
    expect(translateText("Ponude pronađene", "de")).toBe("Angebote gefunden");
    expect(translateText("Čeka analizu", "sr")).toBe("Čeka analizu");
    expect(translateText("Odluka spremna", "en")).toBe("Decision ready");
  });
});
