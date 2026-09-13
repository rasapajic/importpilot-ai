import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/costs/cost-calculator-form.tsx"),
  "utf8",
);
const transportSource = readFileSync(
  join(process.cwd(), "components/costs/transport-cost-assistant.tsx"),
  "utf8",
);
const fxRouteSource = readFileSync(
  join(process.cwd(), "app/api/fx/latest/route.ts"),
  "utf8",
);

describe("ImportPilot 1.0 profitability entry", () => {
  it("keeps the user selling price in EUR before the technical-cost disclosure", () => {
    const sellingPrice = source.indexOf('name="targetSellingPriceEur"');
    const importCostDetails = source.indexOf('<details className="advanced-costs cost-form-wide" open={editInitially}>');

    expect(sellingPrice).toBeGreaterThan(-1);
    expect(source).toContain("{copy.sellingPrice} (EUR)");
    expect(importCostDetails).toBeGreaterThan(-1);
    expect(sellingPrice).toBeLessThan(importCostDetails);
  });

  it("requires a fresh authenticated ECB snapshot for non-EUR calculation", () => {
    expect(source).toContain('fetch("/api/fx/latest"');
    expect(source).toContain('fxStatus !== "ready"');
    expect(source).toContain('disabled={pending || fxStatus !== "ready"}');
    expect(source).toContain("Za ${currency} nema svežeg ECB referentnog kursa");
    expect(fxRouteSource).toContain("authenticateRequest");
    expect(fxRouteSource).toContain("getLatestEcbFxSnapshot");
    expect(fxRouteSource).toContain("status: 503");
  });

  it("converts the EUR selling price into the offer currency before backend calculation", () => {
    expect(source).toContain("convertFromEur(sellingPriceEur, currency, fxSnapshot)");
    expect(source).toContain("body.targetSellingPrice = sellingPriceInOfferCurrency.toFixed(2)");
    expect(source).toContain("delete body.targetSellingPriceEur");
  });

  it("converts EUR transport estimates before applying them to offer-currency fields", () => {
    expect(transportSource).toContain("convertFromEur(route.estimatedCostEur, currency, fxSnapshot)");
    expect(transportSource).toContain("onApply(formatCurrency(convertedCost))");
    expect(transportSource).not.toContain("onApply(route.estimatedCostEur.toFixed(2))");
    expect(transportSource).toContain("A fresh ECB exchange rate is required");
  });

  it("puts technical import inputs behind progressive disclosure", () => {
    expect(source).toContain('<details className="advanced-costs cost-form-wide" open={editInitially}>');
    expect(source).toContain("TransportCostAssistant");
    expect(source).toContain('name="customsDutyRate"');
    expect(source).toContain('name="vatRate"');
  });

  it("still requires explicit import-cost review instead of silently treating unknown costs as free", () => {
    const details = source.indexOf('<details className="advanced-costs cost-form-wide" open={editInitially}>');
    const submit = source.indexOf('type="submit"');

    expect(details).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(details);
    expect(source).toContain("Proverite i potvrdite uvozne troškove");
  });
});