import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractMadeInChinaProductDetails,
  extractPriceTiers,
  inspectPreviewExtraction,
  parseProductPreview,
} from "../src/parser.js";

const fixturePath = (...parts: string[]) => join(import.meta.dirname, "fixtures", ...parts);
const fixture = (name: string) => readFileSync(fixturePath(name), "utf8");

describe("URL import provider parser", () => {
  it("extracts normalized Alibaba product detail fields", () => {
    const preview = parseProductPreview(
      fixture("alibaba-product-detail.html"),
      "https://www.alibaba.com/product-detail/Factory-65W-USB-C-GaN-Charger_1600000000001.html",
    );

    expect(preview).toMatchObject({
      productTitle: "Factory 65W USB C GaN Charger",
      supplierName: "Shenzhen Reliable Power Co., Ltd.",
      price: "4.80",
      currency: "USD",
      minimumOrderQuantity: "100",
      incoterm: "FOB",
      imageUrl: "https://sc04.alicdn.com/kf/charger-main.jpg",
      productUrl: "https://www.alibaba.com/product-detail/Factory-65W-USB-C-GaN-Charger_1600000000001.html",
      details: null,
    });
  });

  it("reports parser candidates before normalization", () => {
    const snapshot = inspectPreviewExtraction(fixture("alibaba-product-detail.html"));

    expect(snapshot.fieldCount).toBeGreaterThanOrEqual(6);
    expect(snapshot.candidates.slice(0, 3)).toEqual([
      { field: "productTitle", value: "Factory 65W USB C GaN Charger" },
      { field: "supplierName", value: "Shenzhen Reliable Power Co., Ltd." },
      { field: "price", value: "4.80" },
    ]);
    expect(snapshot.detailCounts).toEqual({
      priceTiers: 0,
      attributes: 0,
      variants: 0,
      packagingFields: 0,
    });
  });

  it("extracts normalized Made-in-China product fields", () => {
    const preview = parseProductPreview(
      fixture("made-in-china-product.html"),
      "https://www.made-in-china.com/productdetail/20W-Mobile-Phone-Charger_abc123.html",
    );

    expect(preview).toMatchObject({
      productTitle: "20W Mobile Phone Charger",
      supplierName: "Xiamen Charger Supplier Co., Ltd.",
      price: "3.45",
      currency: "USD",
      minimumOrderQuantity: "200",
      imageUrl: "https://image.made-in-china.com/charger.jpg",
      details: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
      },
    });
  });

  it("keeps each visible tier price paired with its own quantity range", () => {
    const productUrl = "https://mistingsystem.en.made-in-china.com/product/example/China-Misting-Nozzles.html";
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Misting System Mist Nozzles Outdoor Nozzles">
          <meta property="og:image" content="https://image.made-in-china.com/misting-nozzle.jpg">
          <script>{"price":"0.65","minimumOrderQuantity":"100"}</script>
        </head>
        <body>
          <h1>Misting System Mist Nozzles Outdoor Nozzles</h1>
          <div class="price-tier"><strong>US$0.85</strong><span>100-999 Pieces</span></div>
          <div class="price-tier"><strong>US$0.70</strong><span>1,000-9,999 Pieces</span></div>
          <div class="price-tier"><strong>US$0.65</strong><span>10,000+ Pieces</span></div>
          <div>Min. Order: 100 Pieces</div>
          <div>FOB</div>
        </body>
      </html>
    `;

    expect(extractPriceTiers(html)).toEqual([
      { price: "0.85", currency: "USD", minQuantity: 100, maxQuantity: 999 },
      { price: "0.70", currency: "USD", minQuantity: 1_000, maxQuantity: 9_999 },
      { price: "0.65", currency: "USD", minQuantity: 10_000, maxQuantity: null },
    ]);
    expect(parseProductPreview(html, productUrl)).toMatchObject({
      price: "0.85",
      currency: "USD",
      minimumOrderQuantity: "100",
      details: {
        priceTiers: [
          { price: "0.85", currency: "USD", minQuantity: 100, maxQuantity: 999 },
          { price: "0.70", currency: "USD", minQuantity: 1_000, maxQuantity: 9_999 },
          { price: "0.65", currency: "USD", minQuantity: 10_000, maxQuantity: null },
        ],
      },
    });
  });

  it("extracts and classifies Made-in-China facts, variants and packaging", () => {
    const html = fixture("made-in-china-supplier-product.html");
    const details = extractMadeInChinaProductDetails(html);

    expect(details).toMatchObject({
      adapter: "made-in-china-product-page-v2",
      evidence: "PRODUCT_PAGE",
      attributes: expect.arrayContaining([
        { name: "Model NO.", value: "ET-01", category: "PRODUCT_SPECIFICATION" },
        { name: "Voltage", value: "48V / 60V", category: "PRODUCT_SPECIFICATION" },
        { name: "Certification", value: "CE, EEC", category: "PRODUCT_SPECIFICATION" },
      ]),
      variants: expect.arrayContaining([
        { name: "Color", values: ["Black", "White"] },
        { name: "Voltage", values: ["48 V", "60 V"] },
      ]),
      packaging: {
        sellingUnit: "Single item",
        packageType: "Steel frame and carton",
        packageLengthCm: 180,
        packageWidthCm: 75,
        packageHeightCm: 115,
        grossWeightKg: 135,
        piecesPerCarton: 1,
        scope: "CARTON",
        confidence: "HIGH",
        usableForLandedCost: true,
        validationNote: null,
      },
    });
    expect(details.attributes.some((attribute) => attribute.name === "Package Size"))
      .toBe(false);
    expect(details.variants.some((variant) => variant.name === "Battery"))
      .toBe(false);
  });

  it("maximizes extraction from Made-in-China supplier product HTML", () => {
    const productUrl = "https://engtianvehicle.en.made-in-china.com/product/dOfmlFDuEHcI/China-Electric-Scooter-Hot-Selling-Made-in-China-High-Quality-Popular-Model-and-Cheaper-CKD-Price.html";
    const html = fixture("made-in-china-supplier-product.html");
    const preview = parseProductPreview(html, productUrl);
    const snapshot = inspectPreviewExtraction(html, productUrl);

    expect(preview).toMatchObject({
      productTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price",
      supplierName: "Jiangsu Engtian Vehicle Co., Ltd.",
      price: "168.50",
      currency: "USD",
      minimumOrderQuantity: "20",
      incoterm: "FOB",
      imageUrl: "https://image.made-in-china.com/202f0j00scooter-main.jpg",
      productUrl,
      details: {
        adapter: "made-in-china-product-page-v2",
        evidence: "PRODUCT_PAGE",
      },
    });
    expect(snapshot).toMatchObject({
      blocked: false,
      fieldCount: expect.any(Number),
      pageTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price - Electric Scooter and E Scooter",
      detailCounts: {
        priceTiers: 0,
        attributes: 3,
        variants: 2,
        packagingFields: 10,
      },
    });
    expect(snapshot.fieldCount).toBeGreaterThanOrEqual(7);
  });

  it("rejects Made-in-China navigation and HTML fragment false positives", () => {
    const productUrl = "https://engtianvehicle.en.made-in-china.com/product/dOfmlFDuEHcI/China-Electric-Scooter-Hot-Selling-Made-in-China-High-Quality-Popular-Model-and-Cheaper-CKD-Price.html";
    const html = `
      <html>
        <head>
          <title>English</title>
          <meta property="og:title" content="English">
          <meta property="og:image" content="//image.made-in-china.com/202f0j00electric-scooter.jpg">
        </head>
        <body>
          <nav>English Deutsch Español Home Products Supplier</nav>
          <div>Supplier: chat button-block J-sr-side-contSupplier-chat"&gt;</div>
          <div class="price">FOB Price: US$ 165.00 / Piece</div>
          <div>Min. Order: 20 Pieces</div>
          <div>EXW Shanghai</div>
        </body>
      </html>
    `;

    const preview = parseProductPreview(html, productUrl);
    const snapshot = inspectPreviewExtraction(html, productUrl);

    expect(preview).toMatchObject({
      productTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price",
      supplierName: null,
      price: "165.00",
      currency: "USD",
      minimumOrderQuantity: "20",
      incoterm: "EXW",
      imageUrl: "https://image.made-in-china.com/202f0j00electric-scooter.jpg",
    });
    expect(snapshot.candidates.some((candidate) => candidate.value === "English")).toBe(false);
    expect(snapshot.candidates.some((candidate) => /chat button-block|J-sr|Supplier-chat/i.test(candidate.value))).toBe(false);
  });

  it("detects blocked pages clearly", () => {
    expect(() => parseProductPreview(
      fixture("blocked-page.html"),
      "https://www.alibaba.com/product-detail/Blocked-Charger_1600000000002.html",
    )).toThrow("BLOCKED");
  });
});
