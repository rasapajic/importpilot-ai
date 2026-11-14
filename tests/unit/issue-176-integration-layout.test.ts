import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const text = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const panel = text("components/projects/simple-profitability-panel.tsx");
const comparison = text("components/projects/preliminary-offer-comparison.tsx");
const css = text("app/preliminary-offer-comparison.css");
const page = text("app/(dashboard)/projects/[projectId]/page.tsx");
const layout = text("app/layout.tsx");
const domain = text("modules/product-search/domain/preliminary-offer-comparison.ts");

describe("Issue #176: adapt existing #177 comparison without regressing #222/#223", () => {
  it("opens source-based 2+ offer comparison before any manual commercial entry", () => {
    const start = panel.indexOf("{showComparison && (");
    const end = panel.indexOf("{!showComparison && (", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(panel.slice(start, end)).toContain("<PreliminaryOfferComparison");
    expect(panel.slice(start, end)).not.toContain("<CommercialTermsForm");
    expect(panel.slice(end)).toContain("<CommercialTermsForm");
    expect(panel).toContain("const showComparison = !focusedOffer && offersForInput.length >= 2;");
    expect(panel).toContain("?selectedOffer=${offer.id}#workflow-step-decision");
    expect(comparison).toContain('openDetail: "Detalji i potvrda"');
    expect(comparison).toContain('href={detailHref}');
  });

  it("does not upgrade listing/cached price into confirmed supplier quotation", () => {
    expect(panel).toContain("writtenQuoteConfirmed: false");
    expect(panel).toContain("bridgeSavedOfferSearchEvidence({");
    expect(panel).toContain("cachedResults: cachedSearchResults");
    expect(page).toContain("cachedSearchResults={initialSupplierSearch?.results ?? []}");
    expect(domain).toContain('const writtenQuote = offer.writtenQuoteConfirmed && storedPrice !== null');
    expect(domain).toContain('const priceLow = writtenQuote');
    expect(domain).toContain("advertisedLow ?? storedPrice");
    expect(domain).toContain('"USER_ENTERED_UNVERIFIED"');
    expect(domain).toContain('row.priceEvidence === "ADVERTISED_PRICE" || row.priceEvidence === "ADVERTISED_RANGE"');
    expect(comparison).toContain("Ručno uneta cena — nema dokaza");
    expect(comparison).toContain("nije nabavna cena");
    expect(comparison).toContain("blokirano dok nema potvrđene nabavne cene");
  });

  it("preserves scoped PR #223 styles and mobile 390px fallback", () => {
    expect(layout).toContain('import "./commercial-terms-form.css";');
    expect(layout).toContain('import "./preliminary-offer-comparison.css";');
    expect(css).toContain('.preliminary-comparison-grid[data-columns="3"]');
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(css).not.toContain("body {");
    expect(text("app/commercial-terms-form.css")).toContain(".commercial-terms-form");
  });
});
