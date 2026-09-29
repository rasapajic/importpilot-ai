import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const offersPanel = readFileSync(join(root, "components/offers/offers-panel.tsx"), "utf8");
const decisionPanel = readFileSync(join(root, "components/decisions/project-decision-panel.tsx"), "utf8");
const workflowPage = readFileSync(join(root, "components/projects/project-workflow-page.tsx"), "utf8");
const rfqPanel = readFileSync(join(root, "components/search/rfq-request-panel.tsx"), "utf8");
const supplierSearch = readFileSync(join(root, "components/search/supplier-offer-search.tsx"), "utf8");
const styles = readFileSync(join(root, "app/globals.css"), "utf8");
const costForm = readFileSync(join(root, "components/costs/cost-calculator-form.tsx"), "utf8");
const transportAssistant = readFileSync(join(root, "components/costs/transport-cost-assistant.tsx"), "utf8");
const timeline = readFileSync(join(root, "components/timeline/project-timeline.tsx"), "utf8");

describe("offer-linked analysis flow", () => {
  it("starts analysis from a concrete offer card", () => {
    expect(offersPanel).toContain('t("Analiziraj ponudu")');
    expect(offersPanel).toContain("analyzeOffer(offer.id)");
    expect(workflowPage).toContain("showAnalysisActions");
  });

  it("shows analyzed offer facts and disables recommendation without them", () => {
    expect(decisionPanel).toContain("analyzedOffers.map");
    expect(decisionPanel).toContain("offer.productName");
    expect(decisionPanel).toContain("offer.supplierName");
    expect(decisionPanel).toContain('getProjectStepHref(projectId, "OFFERS")');
    expect(decisionPanel).toContain('t("Izračunaj isplativost")');
    expect(decisionPanel).toContain('t("Nije moguće proceniti isplativost")');
    expect(decisionPanel).toContain('triggerLabel="Zatraži podatke od dobavljača"');
    expect(workflowPage).toContain("searchParams.offer");
    expect(offersPanel).toContain('"&rfq=1"');
    expect(rfqPanel).toContain("useState(initiallyOpen)");
  });

  it("requires a city and postal code before copying an RFQ", () => {
    expect(rfqPanel).toContain("!deliveryCity.trim() || !postalCode.trim()");
    expect(rfqPanel).toContain('t("Unesite grad i poštanski broj pre kopiranja poruke.")');
    expect(rfqPanel).toContain('t("Poruka je kopirana")');
    expect(rfqPanel).toContain('data-no-translate="true"');
  });

  it("uses the real product query and prevents duplicate offer imports", () => {
    expect(workflowPage).toContain("searchProductName");
    expect(workflowPage).toContain("existingSearchOffers");
    expect(supplierSearch).toContain("isAlreadyAdded(result)");
    expect(supplierSearch).toContain('t("Već dodato")');
  });

  it("uses a non-loading cursor for disabled controls", () => {
    expect(styles).toMatch(/button:disabled\s*{[^}]*cursor:\s*not-allowed/s);
    expect(styles).not.toMatch(/button:disabled\s*{[^}]*cursor:\s*wait/s);
  });

  it("asks for offer type before Incoterm on an unclassified offer", () => {
    expect(offersPanel).toContain('classification.kind === "UNKNOWN"');
    expect(offersPanel).toContain('t("Prvo potvrdite vrstu ponude")');
    expect(offersPanel).toContain('t("Incoterm je potreban samo za direktan uvoz.")');
  });

  it("separates the VAT rate, VAT base and VAT amount", () => {
    expect(costForm).toContain('t("Stopa PDV-a")');
    expect(costForm).toContain('t("Osnovica za PDV")');
    expect(costForm).toContain('t("Iznos PDV-a")');
    expect(costForm).toContain('t("nije moguće izračunati dok carinska osnovica nije poznata")');
  });

  it("labels available transport estimates separately from a selected estimate", () => {
    expect(transportAssistant).toContain('"Procene transporta su dostupne"');
    expect(transportAssistant).toContain('setSelectedMode(mode)');
    expect(transportAssistant).toContain('"Transport procenjen"');
  });

  it("opens the persisted calculation form after client-side recalculation navigation", () => {
    expect(costForm).toContain("if (!editInitially) return;");
    expect(offersPanel).toContain(
      'key={`${offer.id}-${selectedCalculationOfferId === offer.id ? "edit" : "summary"}`}',
    );
    expect(costForm).toContain(
      'panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })',
    );
  });

  it("uses public analysis history text and a non-overlapping date layout", () => {
    expect(timeline).toContain('ASSESSMENT_COMPLETED: "Ponuda je analizirana"');
    expect(timeline).toContain("containsInternalAcceptanceText");
    expect(styles).toMatch(/\.timeline-list time\s*{[^}]*display:\s*block/s);
    expect(styles).toMatch(/\.timeline-list li > div:last-child\s*{[^}]*min-width:\s*0/s);
  });
});
