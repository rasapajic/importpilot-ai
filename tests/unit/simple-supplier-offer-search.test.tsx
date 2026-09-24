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
const resultCss = readFileSync(
  join(process.cwd(), "app/search-result-actions.css"),
  "utf8",
);

describe("ImportPilot 1.0 simple supplier results", () => {
  it("shows how many candidates were reviewed and why offers were selected", () => {
    expect(resultsSource).toContain("unfilteredResultCount");
    expect(resultsSource).toContain("SupplierOfferSearchSummary");
    expect(resultsSource).toContain("searchSummary.parsedResults");
    expect(resultsSource).toContain("searchSummary.relevantCandidates");
    expect(resultsSource).toContain('liveSelectionOverview: (found, relevant, shown)');
    expect(resultsSource).toContain("Pronađeno");
    expect(resultsSource).toContain("JAKOV360 je pregledao");
    expect(resultsSource).toContain('cachedSelectionOverview: (shown)');
    expect(resultsSource).toContain("Ovo nije ukupan broj kandidata nove pretrage.");
    expect(resultsSource).toContain('origin === "cache"');
    expect(resultsSource).toContain('whySelected: "Zašto je izdvojena"');
    expect(resultsSource).toContain("selectionReasons(effectiveResult, analysis, quantity, text)");
    expect(resultsSource).toContain('className="supplier-selection-summary"');
    expect(resultsSource).toContain('className="selection-reasons"');
    expect(resultCss).toContain(".supplier-selection-summary");
    expect(resultCss).toContain(".selection-reasons");
  });

  it("keeps the main result card focused on the buying decision", () => {
    expect(resultsSource).toContain("Najbolje ponude");
    expect(resultsSource).toContain("Cena dobavljača");
    expect(resultsSource).toContain("Ukupno sa cenom uvoza");
    expect(resultsSource).toContain("Rizik dobavljača");
    expect(resultsSource).toContain("Dodaj za poređenje");
    expect(resultsSource).toContain("Detalji analize");
  });

  it("shows a clear delivery-time unit in every supported language", () => {
    expect(resultsSource).toContain('delivery: "Rok isporuke"');
    expect(resultsSource).toContain('display === "1" ? "dan" : "dana"');
    expect(resultsSource).toContain('display === "1" ? "Tag" : "Tage"');
    expect(resultsSource).toContain('display === "1" ? "day" : "days"');
    expect(resultsSource).toContain("formatDeliveryTimeDays(deliveryEstimate.deliveryTimeDays, locale)");
  });

  it("does not repeat an unknown supplier-risk card on every offer", () => {
    expect(resultsSource).toContain('supplierRiskDeferred: "Detaljna provera rizika');
    expect(resultsSource).toContain("hasDeferredSupplierRisk");
    expect(resultsSource).toContain('className="supplier-risk-notice"');
    expect(resultsSource).toContain('analysis.supplierRiskLevel !== "UNKNOWN" || supplierPlatformSummary');
    expect(resultCss).toContain(".supplier-risk-notice");
  });

  it("shows supplier price per piece and a separate total for the requested quantity", () => {
    expect(resultsSource).toContain('supplierOrderTotal: (quantity) => `Za ${quantity} kom`');
    expect(resultsSource).toContain("formatSupplierPriceWithEuro(");
    expect(resultsSource).toContain("formatSupplierOrderTotalWithEuro(");
    expect(resultsSource).toContain("effectiveResult.price * quantity");
    expect(resultsSource).toContain('className="supplier-order-total"');
    expect(resultsSource).toContain('fxConversionNote: "Preračunato po kursu korišćenom za obračun uvoza."');
    expect(resultsSource).toContain('className="supplier-fx-note"');
    expect(resultCss).toContain(".supplier-fx-note");
    expect(resultsSource).not.toContain('/ ${formatQuantity(quantity, locale)} ${text.pieces}');
  });

  it("uses the same fresh FX snapshot for the main price, order total, and quantity tiers", () => {
    expect(resultsSource).toContain("convertToEur(value, currency, fxSnapshot)");
    expect(resultsSource).toContain("tier.currency,");
    expect(resultsSource).toContain("snapshot.currency,");
    expect(resultsSource).toContain("fxSnapshot,");
    expect(resultsSource).toContain('currency.toUpperCase() === "EUR" || !fxSnapshot');
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
    expect(resultsSource).toContain("supplierPriceTierSnapshots(result)");
    expect(resultsSource).toContain("priceTierSnapshots.length > 0");
    expect(resultsSource).toContain("supplierOfferVariantFacts(result)");
    expect(resultsSource).toContain("Cene po količini");
    expect(resultsSource).toContain("Varijante");
    expect(resultsSource).toContain("selectOffer(effectiveResult)");
  });

  it("shows every available candidate and marks only the top-ranked offer as best", () => {
    const rankingStart = resultsSource.indexOf("const analysisByUrl");
    const renderStart = resultsSource.indexOf("return (", rankingStart);
    const rankingSource = resultsSource.slice(rankingStart, renderStart);
    expect(rankingSource).not.toContain('matchStatus !== "MISMATCH"');
    expect(rankingSource).not.toContain(".slice(0, 10)");
    expect(resultsSource).toContain('bestChoice: "Najbolji izbor"');
    expect(resultsSource).toContain('index === 0 && <span className="best-choice-badge">');
    expect(resultCss).toContain(".search-result-card-best");
    expect(resultCss).toContain(".best-choice-badge");
  });

  it("retries exact-page data without blocking the initial result list", () => {
    expect(resultsSource).toContain("recoveryAttemptedUrls");
    expect(resultsSource).toContain("/supplier-search/url-preview");
    expect(resultsSource).toContain("mergeRecoveredSupplierPreview");
    expect(resultsSource).toContain("!isLikelyProductImageUrl(result.imageUrl)");
    expect(resultsSource).toContain("!result.marketplaceDetails?.priceTiers.length");
  });

  it("maps deep analysis to the simple 1.0 decision vocabulary", () => {
    expect(resultsSource).toContain('decision: { BUY: "KUPI", NEGOTIATE: "PREGOVARAJ", WATCH: "PRATI", SKIP: "PRESKOČI" }');
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

  it("keeps the simple result list open while multiple offers are selected", () => {
    const selectStart = resultsSource.indexOf("async function selectOffer");
    const continueStart = resultsSource.indexOf("function continueWithSelectedOffers");
    const selectionSource = resultsSource.slice(selectStart, continueStart);
    expect(selectStart).toBeGreaterThanOrEqual(0);
    expect(continueStart).toBeGreaterThan(selectStart);
    expect(selectionSource).toContain("setSelectedOfferIds");
    expect(selectionSource).not.toContain("router.push(");
    expect(selectionSource).not.toContain("router.refresh()");
    expect(resultsSource).toContain('select: "Dodaj za poređenje"');
    expect(resultsSource).toContain('select: "Zum Vergleich hinzufügen"');
    expect(resultsSource).toContain('select: "Add for comparison"');
    expect(resultsSource).toContain("selectedOfferIds.length > 0");
  });

  it("advances to the decision step only through the explicit continue action", () => {
    const continueStart = resultsSource.indexOf("function continueWithSelectedOffers");
    const analysisStart = resultsSource.indexOf("const analysisByUrl", continueStart);
    const continueSource = resultsSource.slice(continueStart, analysisStart);
    expect(continueSource).toContain("selectedOfferIds.length === 0");
    expect(continueSource).toContain("router.push(`/projects/${projectId}#workflow-step-decision`)");
    expect(continueSource).toContain("router.refresh()");
    expect(resultsSource).toContain("text.selectionSummary(selectedOfferIds.length)");
    expect(resultsSource).toContain("text.continueWithSelected");
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
  it("keeps supplier decision facts separated and readable on phones", () => {
    expect(resultCss).toContain(".offer-highlights {");
    expect(resultCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(resultCss).toContain(".offer-highlights > span");
    expect(resultCss).toContain("grid-template-columns: 1fr");
  });

  it("keeps supplier images bounded on phones instead of rendering source dimensions", () => {
    expect(resultCss).toContain(".search-result-image {");
    expect(resultCss).toContain("object-fit: contain");
    expect(resultCss).toContain("height: 13rem");
    expect(resultCss).toContain("max-width: 100%");
  });

  it("lets cached results be replaced with a new live search", () => {
    expect(resultsSource).toContain('liveRefresh: "Ponovi živu pretragu"');
    expect(resultsSource).toContain('className="cached-result-notice"');
    expect(resultsSource).toContain("onClick={() => void runSearch()}");
  });

  it("links the supplier result header directly to the source offer", () => {
    expect(resultsSource).toContain('className="supplier-source-link"');
    expect(resultsSource).toContain('href={result.productUrl}');
    expect(resultsSource).toContain('target="_blank"');
  });

});
