import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  join(process.cwd(), "components/projects/simple-profitability-panel.tsx"),
  "utf8",
);
const comparisonSource = readFileSync(
  join(process.cwd(), "components/projects/preliminary-offer-comparison.tsx"),
  "utf8",
);
const cssSource = readFileSync(
  join(process.cwd(), "app/search-result-actions.css"),
  "utf8",
);
const formSource = readFileSync(
  join(process.cwd(), "components/offers/commercial-terms-form.tsx"),
  "utf8",
);

describe("three-supplier comparison layout", () => {
  it("keeps the comparison side by side and moves quote entry off that page", () => {
    const show = panelSource.indexOf("{showComparison && (");
    const detail = panelSource.indexOf("{!showComparison && (");

    expect(panelSource).toContain("const showComparison = !focusedOffer && offersForInput.length >= 2");
    expect(show).toBeGreaterThan(0);
    expect(detail).toBeGreaterThan(show);
    expect(panelSource.slice(show, detail)).toContain("<PreliminaryOfferComparison");
    expect(panelSource.slice(show, detail)).not.toContain("<CommercialTermsForm");
    expect(panelSource.slice(show, detail)).not.toContain("<CostCalculatorForm");
    expect(panelSource.slice(detail)).toContain("<CommercialTermsForm");
    expect(panelSource.slice(detail)).toContain("<CostCalculatorForm");
  });

  it("opens one supplier detail and returns to the comparison without dropping the offer id", () => {
    expect(panelSource).toContain("?selectedOffer=${offer.id}#workflow-step-decision");
    expect(panelSource).toContain('const comparisonHref = `/projects/${projectId}#workflow-step-decision`');
    expect(panelSource).toContain("backToComparison: \"Nazad na poređenje\"");
    expect(panelSource).toContain("href={comparisonHref}");
    expect(comparisonSource).toContain('openDetail: "Detalji i potvrda"');
    expect(comparisonSource).toContain("aria-label={`${text.openDetail}: ${row.supplierName}`}");
    expect(formSource).toContain("`/api/offers/${offerId}/commercial-terms`");
  });

  it("uses three columns on a wide screen and one column on a phone", () => {
    expect(comparisonSource).toContain("data-columns={columns}");
    expect(comparisonSource).toContain("const columns = Math.min(rows.length, 3)");
    expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(cssSource).toContain('@media (min-width: 1100px)');
    expect(cssSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });

  it("keeps freight, duty, VAT, and the mixed quantity unconfirmed in the comparison", () => {
    expect(comparisonSource).toContain('notEvidenced: "nije poznato — nema dokaza"');
    expect(comparisonSource).toContain('mixedUnconfirmed: "nije potvrđeno"');
    expect(comparisonSource).toContain("comparisonInquiryPriority");
    expect(comparisonSource).toContain("orderPreliminaryComparisonRows");
    expect(comparisonSource).toContain("inquiry.priceUsed ? inquiry.priorityById[row.id]");
    expect(comparisonSource).toContain("text.landedBlocked");
    expect(comparisonSource).not.toContain("Najbolji izbor");
  });
});
