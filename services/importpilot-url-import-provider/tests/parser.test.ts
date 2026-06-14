import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectPreviewExtraction, parseProductPreview } from "../src/parser.js";

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
  });

  it("extracts normalized Made-in-China product fields", () => {
    const preview = parseProductPreview(
      fixture("made-in-china-product.html"),
      "https://www.made-in-china.com/productdetail/20W-Mobile-Phone-Charger_abc123.html",
    );

    expect(preview).toMatchObject({
      productTitle: "20W Mobile Phone Charger",
      supplierName: "Xiamen Charger Supplier",
      price: "3.45",
      currency: "USD",
      minimumOrderQuantity: "200",
      imageUrl: "https://image.made-in-china.com/charger.jpg",
    });
  });

  it("maximizes extraction from Made-in-China supplier product HTML", () => {
    const productUrl = "https://engtianvehicle.en.made-in-china.com/product/dOfmlFDuEHcI/China-Electric-Scooter-Hot-Selling-Made-in-China-High-Quality-Popular-Model-and-Cheaper-CKD-Price.html";
    const html = fixture("made-in-china-supplier-product.html");
    const preview = parseProductPreview(html, productUrl);
    const snapshot = inspectPreviewExtraction(html);

    expect(preview).toMatchObject({
      productTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price",
      supplierName: "Jiangsu Engtian Vehicle Co., Ltd.",
      price: "168.50",
      currency: "USD",
      minimumOrderQuantity: "20",
      incoterm: "FOB",
      imageUrl: "https://image.made-in-china.com/202f0j00scooter-main.jpg",
      productUrl,
    });
    expect(snapshot).toMatchObject({
      blocked: false,
      fieldCount: expect.any(Number),
      pageTitle: "China Electric Scooter Hot Selling Made in China High Quality Popular Model and Cheaper CKD Price - Electric Scooter and E Scooter",
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
    const snapshot = inspectPreviewExtraction(html);

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
