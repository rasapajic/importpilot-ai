import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const resultsSource = readFileSync(
  join(process.cwd(), "components/search/simple-supplier-offer-search.tsx"),
  "utf8",
);
const projectSource = readFileSync(
  join(process.cwd(), "app/(dashboard)/projects/[projectId]/page.tsx"),
  "utf8",
);

describe("ImportPilot 1.0 simple supplier results", () => {
  it("keeps the main result card focused on the buying decision", () => {
    expect(resultsSource).toContain("Najbolje ponude");
    expect(resultsSource).toContain("Cena dobavljača");
    expect(resultsSource).toContain("Landed cost");
    expect(resultsSource).toContain("Dobavljač");
    expect(resultsSource).toContain("Izaberi ponudu");
    expect(resultsSource).toContain("Detalji analize");
  });

  it("recalculates visible non-EUR preliminary landed cost with fresh ECB FX", () => {
    expect(resultsSource).toContain('fetch("/api/fx/latest"');
    expect(resultsSource).toContain("estimateTajaPreliminaryLandedCost");
    expect(resultsSource).toContain('fxSnapshot: effectiveResult.currency === "EUR" ? null : fxSnapshot');
    expect(resultsSource).toContain("targetMarginPercent: 0");
    expect(resultsSource).toContain("const liveEstimate = quantity && targetCountry");
    expect(resultsSource).toContain("liveEstimate.basePerUnitEur");
    expect(resultsSource).not.toContain("const estimate = analysis?.preliminaryCostEstimate ?? null");
  });

  it("uses source quantity tiers and exposes more source-grounded choices", () => {
    expect(resultsSource).toContain("supplierOfferForQuantity(result, quantity)");
    expect(resultsSource).toContain("quantityPriceSnapshots(result, quantity)");
    expect(resultsSource).toContain("supplierOfferVariantFacts(result)");
    expect(resultsSource).toContain("Cene po količini");
    expect(resultsSource).toContain("Varijante");
    expect(resultsSource).toContain(".slice(0, 10)");
    expect(resultsSource).toContain("selectOffer(effectiveResult)");
  });

  it("maps deep analysis to the simple 1.0 decision vocabulary", () => {
    expect(resultsSource).toContain('return "BUY" as const');
    expect(resultsSource).toContain('return "NEGOTIATE" as const');
    expect(resultsSource).toContain('return "SKIP" as const');
    expect(resultsSource).toContain('return "WATCH" as const');
  });

  it("does not expose advanced search criteria in the simple results UI", () => {
    expect(resultsSource).not.toContain("setTargetMarginPercent");
    expect(resultsSource).not.toContain("Ciljna marža (%)");
    expect(resultsSource).not.toContain("privateLabel: true");
    expect(resultsSource).not.toContain("maxUnitPrice");
    expect(resultsSource).not.toContain("preparedQueries");
  });

  it("opens the exact selected offer directly in the decision step", () => {
    expect(resultsSource).toContain("existingOfferId?: string");
    expect(resultsSource).toContain("selectedOffer=${encodeURIComponent(selectedOfferId)}#workflow-step-decision");
    expect(projectSource).toContain("selectedOffer?: string");
    expect(projectSource).toContain("const focusedOfferId = project.offers.some");
    expect(projectSource).toContain("focusedOfferId={focusedOfferId}");
    expect(projectSource).toContain("Boolean(selectedCalculationOfferId || focusedOfferId)");
  });

  it("uses the simple results screen in the normal project flow and keeps legacy URL import isolated", () => {
    expect(projectSource).toContain("<SimpleSupplierOfferSearch");
    expect(projectSource).toContain("legacyUrlImport ?");
    expect(projectSource).not.toContain('🎯 {t("Marža")}');
    expect(projectSource).not.toContain('t("Ciljna marža")');
  });

  it("keeps 2.0 tools and duplicate offer lists off the normal 1.0 project screen", () => {
    expect(projectSource).not.toContain("ProfitabilityRecoveryPanel");
    expect(projectSource).not.toContain("NegotiationAssistant");
    expect(projectSource).not.toContain("ProjectTimeline");
    expect(projectSource).not.toContain("DirectUploadForm");
    expect(projectSource).not.toContain("MobileWorkflowActionBar");
    expect(projectSource).not.toContain("OffersPanel");
    expect(projectSource).toContain("Unesite svoju prodajnu cenu");
  });
});