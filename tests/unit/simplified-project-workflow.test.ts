import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { translateText } from "../../modules/i18n/translations";

const pageSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);

describe("simplified project workflow", () => {
  it("uses the simplified user-facing section labels", () => {
    expect(pageSource).toContain("Šta želite da kupite?");
    expect(pageSource).toContain("Ponude dobavljača");
    expect(pageSource).toContain("Da li se isplati?");
    expect(pageSource).toContain("Sledeći korak");
    expect(pageSource).not.toContain('title={t("Izračunajte ukupnu nabavnu cenu")}');
    expect(pageSource).not.toContain('title={t("Analizirajte ponudu")}');
    expect(pageSource).not.toContain('title={t("Donesite odluku")}');
  });

  it("keeps advanced decision details collapsed by default", () => {
    expect(pageSource).toContain("advanced-decision-details");
    expect(pageSource).toContain("open={advancedDetailsOpen}");
    expect(pageSource).toContain("Prikaži detalje");
  });

  it("adds the mobile workflow action bar without changing workflow sections", () => {
    expect(pageSource).toContain("MobileWorkflowActionBar");
    expect(pageSource).toContain("getMobileWorkflowActions");
    expect(pageSource).toContain('id="workflow-step-next"');
  });

  it("keeps profitability active until a final recommendation exists", () => {
    expect(pageSource).toContain("const hasFinalRecommendation = isFinalDecisionStatus(decision?.status)");
    expect(pageSource).toContain('hasFinalRecommendation\n      ? "COMPLETED"\n      : "ACTIVE"');
    expect(pageSource).toContain('summary={hasFinalRecommendation ? getDecisionStepSummary(decision?.status, locale) : t("Nakon preporuke")}');
  });

  it("localizes simplified labels in EN/DE/SR", () => {
    expect(translateText("Da li se isplati?", "en")).toBe("Does it pay off?");
    expect(translateText("Da li se isplati?", "de")).toBe("Lohnt es sich?");
    expect(translateText("Šta želite da kupite?", "sr")).toBe("Šta želite da kupite?");
    expect(translateText("Realna nabavna cena", "en")).toBe("Real purchase price");
    expect(translateText("Sledeći korak", "de")).toBe("Nächster Schritt");
    expect(translateText("Traži bolju cenu", "en")).toBe("Ask for a better price");
    expect(translateText("Ubaci drugi link", "de")).toBe("Anderen Link einfügen");
  });
});
