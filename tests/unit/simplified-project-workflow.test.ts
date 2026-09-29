import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { translateText } from "../../modules/i18n/translations";
import { getProjectStepHref, projectStepLabels } from "../../modules/projects/domain/project-step-routes";

const root = process.cwd();
const workflowSource = readFileSync(join(root, "components/projects/project-workflow-page.tsx"), "utf8");
const decisionSource = readFileSync(join(root, "components/decisions/project-decision-panel.tsx"), "utf8");

describe("five-page project workflow", () => {
  it("uses five distinct, stable routes", () => {
    expect(projectStepLabels).toEqual({
      PRODUCT: "Šta želite da kupite?",
      OFFERS: "Izbor ponude",
      ANALYSIS: "Analiza ponude",
      COSTS: "Troškovi uvoza",
      DECISION: "Poređenje i odluka",
    });
    expect(getProjectStepHref("project-1", "PRODUCT")).toBe("/projects/project-1");
    expect(getProjectStepHref("project-1", "OFFERS")).toBe("/projects/project-1/offers");
    expect(getProjectStepHref("project-1", "ANALYSIS")).toBe("/projects/project-1/analysis");
    expect(getProjectStepHref("project-1", "COSTS")).toBe("/projects/project-1/costs");
    expect(getProjectStepHref("project-1", "DECISION")).toBe("/projects/project-1/decision");
  });

  it("renders only the requested page section", () => {
    for (const step of ["PRODUCT", "OFFERS", "ANALYSIS", "COSTS", "DECISION"]) {
      expect(workflowSource).toContain(`currentStep === "${step}"`);
    }
    expect(workflowSource).toContain("ProjectStepNavigation");
  });

  it("links selection, analysis, costs and decision actions", () => {
    expect(workflowSource).toContain('getProjectStepHref(project.id, "ANALYSIS")');
    expect(workflowSource).toContain('getProjectStepHref(project.id, "COSTS")');
    expect(workflowSource).toContain('getProjectStepHref(project.id, "DECISION")');
    expect(decisionSource).toContain('getProjectStepHref(projectId, "OFFERS")');
    expect(decisionSource).toContain('triggerLabel="Zatraži podatke od dobavljača"');
  });

  it("localizes the new labels in EN, DE and SR", () => {
    expect(translateText("Izbor ponude", "en")).toBe("Offer selection");
    expect(translateText("Troškovi uvoza", "de")).toBe("Importkosten");
    expect(translateText("Poređenje i odluka", "sr")).toBe("Poređenje i odluka");
  });
});
