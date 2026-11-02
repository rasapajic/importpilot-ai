import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "../../components/search/taja-preview-business-summary";
import type { SupplierOfferUrlPreview } from "../../modules/product-search/domain/search";
import { isMistingPreviewContext } from "../../modules/product-search/domain/taja-preview-business-summary";

const glasses: SupplierOfferUrlPreview = {
  title: "Pilot Optics Wholesale High Quality 5 Colors Reading Glasses",
  supplierName: null,
  supplierCountry: null,
  price: 0.5,
  currency: "USD",
  minimumOrderQuantity: 1200,
  incoterm: null,
  imageUrl: null,
  productUrl: "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Reading-Glasses.html",
  source: "pilotoptics.en.made-in-china.com",
  details: null,
  isPartial: true,
  titleFromSlug: false,
};

describe("URL-first TAJA preview across product categories", () => {
  it("shows a generic reading-glasses review with no pump/nozzle claim", () => {
    expect(isMistingPreviewContext(glasses)).toBe(false);
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="sr">
        <TajaPreviewBusinessSummary preview={glasses} />
      </I18nProvider>,
    );
    expect(html).toContain("Pilot Optics");
    expect(html).toContain("Podaci su preuzeti iz oglasa.");
    expect(html).toContain("1200");
    expect(html).not.toMatch(/Pumpa|Mlaznice|mlaznicu|kompletan sistem/);
    expect(html).toContain("Molimo potvrdite tačan model");
  });

  it("preserves the established specialized checks for misting systems", () => {
    const misting = { ...glasses, title: "Outdoor Misting System with Pump and 20 Nozzles" };
    expect(isMistingPreviewContext(misting)).toBe(true);
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="sr">
        <TajaPreviewBusinessSummary preview={misting} />
      </I18nProvider>,
    );
    expect(html).toContain("Pumpa");
    expect(html).toContain("Mlaznice");
  });

  it("keeps the URL import form grid-defined and mobile-first", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".url-first-flow .url-review-form");
    expect(css).toContain(".url-first-flow .url-first-project-fields");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("max-width: 760px");
  });
});
