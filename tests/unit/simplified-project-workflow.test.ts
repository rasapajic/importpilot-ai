import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { translateText } from "../../modules/i18n/translations";

const pageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);
const profitabilitySource = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
  "utf8",
);

describe("simple client workflow", () => {
  it("uses only the three client-facing workflow steps", () => {
    expect(pageSource).toContain("Šta želite da kupite?");
    expect(pageSource).toContain("Ponude dobavljača");
    expect(pageSource).toContain("Da li se isplati?");
    expect(pageSource).toContain("SimpleProfitabilityPanel");
    expect(pageSource).not.toContain('id="workflow-step-next"');
    expect(pageSource).not.toContain('title={t("Sledeći korak")}');
  });

  it("removes duplicated technical and analysis panels from the main flow", () => {
    expect(pageSource).not.toContain("ProjectDecisionPanel");
    expect(pageSource).not.toContain("ComparisonView");
    expect(pageSource).not.toContain("ProjectFeedbackPanel");
    expect(pageSource).not.toContain("advanced-decision-details");
    expect(pageSource).not.toContain('title={t("Detaljna analiza")}');
    expect(pageSource).not.toContain('title={t("Realna nabavna cena")}');
  });

  it("uses one action to assess calculated offers and generate the decision", () => {
    expect(profitabilitySource).toContain("Proveri isplativost");
    expect(profitabilitySource).toContain("/assessments");
    expect(profitabilitySource).toContain("/decisions");
    expect(profitabilitySource).not.toContain("LUNA_COUNTRY_RANKING_V1");
    expect(profitabilitySource).not.toContain("countryProfileVersion");
  });

  it("keeps the cost breakdown optional and secondary", () => {
    expect(profitabilitySource).toContain("Kako je izračunato?");
    expect(profitabilitySource).toContain('<details className="advanced-costs">');
    expect(profitabilitySource).toContain("Promeni troškove");
  });

  it("keeps profitability active until a final recommendation exists", () => {
    expect(pageSource).toContain("const hasFinalRecommendation = isFinalDecisionStatus(decision?.status)");
    expect(pageSource).toContain('hasFinalRecommendation\n      ? "COMPLETED"\n      : "ACTIVE"');
    expect(pageSource).toContain("summary={getDecisionStepSummary(decision?.status, locale)}");
  });

  it("keeps documents and history as secondary information", () => {
    expect(pageSource).toContain("Dodatne informacije");
    expect(pageSource).toContain("Uvozni dokumenti");
    expect(pageSource).toContain("ProjectTimeline");
    expect(pageSource).toContain("MobileWorkflowActionBar");
  });

  it("localizes the primary profitability action", () => {
    expect(translateText("Proveri isplativost", "en")).toBe("Check profitability");
    expect(translateText("Proveri isplativost", "de")).toBe("Rentabilität prüfen");
    expect(translateText("Proveri isplativost", "sr")).toBe("Proveri isplativost");
  });
});
