import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../../components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "../../components/search/taja-preview-business-summary";
import { advertisedRangeDisplay } from "../../modules/product-search/domain/advertised-range-display";
import { supplierOfferUrlPreviewSchema, type SupplierOfferUrlPreview } from "../../modules/product-search/domain/search";

const productUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const range = {
  lowPrice: 0.5,
  highPrice: 2,
  currency: "USD",
  unit: "Piece" as const,
  evidence: "EXACT_PRODUCT_JSONLD" as const,
  sourceUrl: productUrl,
};
const base: SupplierOfferUrlPreview = {
  title: "Pilot Optics Reading Glasses",
  supplierName: "Pilot Optics International Corp. Ltd.",
  supplierCountry: null,
  price: 0.5,
  currency: "USD",
  minimumOrderQuantity: 1200,
  incoterm: null,
  imageUrl: null,
  productUrl,
  source: "pilotoptics.en.made-in-china.com",
  isPartial: true,
  titleFromSlug: false,
  details: null,
};

describe("JAKOV360 #199 price range preview", () => {
  it("shows a source-attested same-SKU range only as unconfirmed public data, in SR", () => {
    const preview = { ...base, advertisedPriceRange: range };
    expect(advertisedRangeDisplay(preview, "sr")).toContain("0,50–2,00 USD/kom.");
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="sr">
        <TajaPreviewBusinessSummary preview={preview} requestedQuantity={1_000} />
      </I18nProvider>,
    );
    expect(html).toContain("Oglašeni raspon za ovaj proizvod");
    expect(html).toContain("Javno oglašeni raspon");
    expect(html).toContain("Prikazana cena");
    expect(html).toContain("0.5 USD");
    expect(html).toContain("Nije potvrđena cena za traženu količinu");
    expect(html).not.toContain("Pumpa");
    expect(html).not.toContain("Mlaznice");
    expect(html).toContain("1200");
  });

  it("renders DE and EN with no implied firm quote", () => {
    const preview = { ...base, advertisedPriceRange: range };
    expect(advertisedRangeDisplay(preview, "de")).toContain("0,50–2,00 USD/Stk.");
    expect(advertisedRangeDisplay(preview, "en")).toContain("0.50–2.00 USD/pc");
    expect(advertisedRangeDisplay(preview, "en")).toContain("Not a confirmed price");
  });

  it("does not attribute another product's price range to this SKU", () => {
    const foreign = { ...range, sourceUrl: productUrl.replace("WJfUCnDTuekA", "ANOTHER") };
    expect(advertisedRangeDisplay({ ...base, advertisedPriceRange: foreign }, "sr")).toBeNull();
    expect(supplierOfferUrlPreviewSchema.safeParse({ ...base, advertisedPriceRange: foreign }).success).toBe(false);
    expect(advertisedRangeDisplay({ ...base, advertisedPriceRange: null }, "sr")).toBeNull();
  });

  it("discards invalid price bounds or mismatching currency", () => {
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, advertisedPriceRange: { ...range, highPrice: 0.4 },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, advertisedPriceRange: { ...range, currency: "EUR" },
    }).success).toBe(false);
  });

  it("without range evidence TAJA still shows just the unconfirmed advertised price", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="sr">
        <TajaPreviewBusinessSummary preview={base} />
      </I18nProvider>,
    );
    expect(html).toContain("0.5 USD");
    expect(html).not.toContain("Oglašeni raspon");
    expect(html).toContain("nije potvrđeno");
  });

  it("shows a clickable exact-SKU video evidence link without claiming a firm quote", () => {
    const videoUrl = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    const evidence = {
      ...range, evidence: "MATCHED_VIDEO_CHANNEL" as const, evidenceUrl: videoUrl,
    };
    const preview = { ...base, advertisedPriceRange: evidence };
    expect(supplierOfferUrlPreviewSchema.safeParse(preview).success).toBe(true);
    expect(advertisedRangeDisplay(preview, "sr")).toContain("0,50–2,00 USD/kom.");
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="sr">
        <TajaPreviewBusinessSummary preview={preview} requestedQuantity={1_000} />
      </I18nProvider>,
    );
    expect(html).toContain(videoUrl);
    expect(html).toContain("Proveri javni cenovni raspon");
    expect(html).toContain("Nije potvrđena cena za traženu količinu");
    expect(html).toContain("1200");
    expect(html).not.toContain("Pumpa");
  });

  it("rejects video evidence from a mismatched SKU or an arbitrary host", () => {
    const url = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    for (const invalid of [
      url.replace("WJfUCnDTuekA", "OTHERPRODUCT12"),
      url.replace("www.made-in-china.com", "attacker.example"),
      url + "?next=other",
    ]) {
      const preview = {
        ...base, advertisedPriceRange: {
          ...range, evidence: "MATCHED_VIDEO_CHANNEL" as const, evidenceUrl: invalid,
        },
      };
      expect(supplierOfferUrlPreviewSchema.safeParse(preview).success).toBe(false);
      expect(advertisedRangeDisplay(preview, "sr")).toBeNull();
    }
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, advertisedPriceRange: { ...range, evidence: "MATCHED_VIDEO_CHANNEL" },
    }).success).toBe(false);
  });

  it("never passes the preview-only range into project creation payload", () => {
    const source = readFileSync("components/projects/create-project-from-url-form.tsx", "utf8");
    const creation = source.slice(source.indexOf("async function createSearch"), source.indexOf("return (", source.indexOf("async function createSearch")));
    expect(creation).not.toContain("advertisedPriceRange");
    expect(source).toContain('sr: "Oglašena cena (nepotvrđena)"');
    expect(source).toContain('de: "Angezeigter Preis (unbestätigt)"');
    expect(source).toContain('en: "Advertised price (unconfirmed)"');
    expect(creation).toContain("preview.price");
    expect(creation).toContain("preview.minimumOrderQuantity");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".url-first-flow .url-review-form");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
