import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const offersPanel = readFileSync(join(root, "components/offers/offers-panel.tsx"), "utf8");
const decisionPanel = readFileSync(join(root, "components/decisions/project-decision-panel.tsx"), "utf8");
const projectPage = readFileSync(join(root, "app/(dashboard)/projects/[projectId]/page.tsx"), "utf8");
const rfqPanel = readFileSync(join(root, "components/search/rfq-request-panel.tsx"), "utf8");

describe("offer-linked analysis flow", () => {
  it("starts analysis from a concrete offer card", () => {
    expect(offersPanel).toContain('t("Analiziraj ponudu")');
    expect(offersPanel).toContain("analyzeOffer(offer.id)");
    expect(projectPage).toContain("showAnalysisActions");
  });

  it("shows analyzed offer facts and disables recommendation without them", () => {
    expect(decisionPanel).toContain("analyzedOffers.map");
    expect(decisionPanel).toContain("offer.productName");
    expect(decisionPanel).toContain("offer.supplierName");
    expect(decisionPanel).toContain("pending || analyzedOffers.length === 0");
    expect(decisionPanel).toContain('href="#workflow-step-offer"');
  });

  it("requires a city and postal code before copying an RFQ", () => {
    expect(rfqPanel).toContain("!deliveryCity.trim() || !postalCode.trim()");
    expect(rfqPanel).toContain('t("Unesite grad i poštanski broj pre kopiranja poruke.")');
    expect(rfqPanel).toContain('t("Poruka je kopirana")');
    expect(rfqPanel).toContain('data-no-translate="true"');
  });
});
