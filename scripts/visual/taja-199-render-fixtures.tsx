/**
 * Isolated visual fixtures. No live routes, supplier requests, saved projects,
 * or Render credentials. Uses real TAJA component and exact app stylesheets.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "../../components/search/taja-preview-business-summary";
import type { SupplierOfferUrlPreview } from "../../modules/product-search/domain/search";

const outputDir = join(process.cwd(), "test-results", "taja-199-mobile");
mkdirSync(outputDir, { recursive: true });

const productUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalogUrl = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const videoUrl = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";

const preview: SupplierOfferUrlPreview = {
  title: "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses",
  supplierName: "Pilot Optics International Corp. Ltd.",
  supplierCountry: null,
  price: 0.5,
  currency: "USD",
  minimumOrderQuantity: 1200,
  incoterm: null,
  imageUrl: null,
  productUrl,
  source: "pilotoptics.en.made-in-china.com",
  details: null,
  isPartial: true,
  titleFromSlug: false,
};

const evidenceBase = {
  productUrl,
  lowPrice: 0.5,
  highPrice: 2,
  currency: "USD",
  unit: "Piece" as const,
  minimumOrderQuantity: 1200,
  verifiedQuote: false as const,
};
const cases = [
  {
    name: "sr-catalog-one-source",
    locale: "sr" as const,
    source: {
      ...evidenceBase,
      kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
      sourceUrl: catalogUrl,
      corroborated: false as const,
    },
  },
  {
    name: "sr-two-public-listings",
    locale: "sr" as const,
    source: {
      ...evidenceBase,
      kind: "CORROBORATED_ADVERTISED_RANGE" as const,
      evidence: [videoUrl, catalogUrl] as [string, string],
    },
  },
  { name: "sr-teaser-only", locale: "sr" as const, source: null },
  {
    name: "de-catalog-one-source",
    locale: "de" as const,
    source: {
      ...evidenceBase,
      kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
      sourceUrl: catalogUrl,
      corroborated: false as const,
    },
  },
  {
    name: "en-catalog-one-source",
    locale: "en" as const,
    source: {
      ...evidenceBase,
      kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
      sourceUrl: catalogUrl,
      corroborated: false as const,
    },
  },
];

const styles = [
  "app/globals.css",
  "app/auth-password.css",
  "app/taja-search-progress.css",
  "app/search-result-actions.css",
  "app/taja-requirement-match.css",
  "app/marketplace-evidence.css",
].map(path => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

for (const example of cases) {
  const data: SupplierOfferUrlPreview = {
    ...preview,
    marketplacePriceEvidence: example.source,
  };
  const rendered = renderToStaticMarkup(
    <I18nProvider initialLocale={example.locale}>
      <TajaPreviewBusinessSummary preview={data} requestedQuantity={1000} />
    </I18nProvider>,
  );
  const title = example.name.replace(/-/g, " ");
  const html = [
    "<!doctype html><html lang=\"" + (example.locale === "sr" ? "sr-Latn" : example.locale) + "\">",
    "<head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">",
    "<title>JAKOV360 #199 - " + title + "</title>",
    "<style>" + styles,
    ".visual-fixture-page { width:100%; max-width:1000px; margin:0 auto; padding:16px 12px 36px; min-width:0; }",
    ".visual-fixture-ident { color:#496158; font-size:.78rem; margin:0 0 12px; overflow-wrap:anywhere; }",
    ".visual-fixture-brand { font-weight:800; font-size:1.15rem; color:#075338; margin:0 0 12px; }",
    "</style></head><body>",
    "<main class=\"visual-fixture-page\">",
    "<p class=\"visual-fixture-brand\">JAKOV360</p>",
    "<p class=\"visual-fixture-ident\">Isolated TAJA component render · " + title + " · not a live supplier quotation</p>",
    rendered,
    "</main></body></html>",
  ].join("\n");
  writeFileSync(join(outputDir, example.name + ".html"), html, "utf8");
  const sourceCount = !example.source ? 0 : "evidence" in example.source ? 2 : 1;
  console.info(JSON.stringify({ fixture: example.name, bytes: Buffer.byteLength(html), sources: sourceCount }));
}
