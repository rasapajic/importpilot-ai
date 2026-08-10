import { describe, expect, it } from "vitest";

import {
  extractMadeInChinaProductDetails,
  extractSupplierName,
  parseProductPreview,
} from "../src/parser.js";

const productUrl = "https://mistingsystem.en.made-in-china.com/product/RdraUfFAsOGt/China-Misting-System-Mist-Nozzles.html";

describe("Made-in-China parser cleanup", () => {
  it("recognizes the supplier from the real Made-in-China compnay-name block", () => {
    const html = `
      <html><body>
        <div class="compnay-name">
          <a href="https://mistingsystem.en.made-in-china.com">
            Ningbo Lisen Spray Technology Equipment Co., Ltd.
          </a>
        </div>
      </body></html>
    `;

    expect(extractSupplierName(html)).toBe(
      "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
    );
  });

  it("prefers structured seller data and ignores marketplace or chat text", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "Product",
              "seller": { "name": "Ningbo Lisen Spray Technology Equipment Co., Ltd." }
            }
          </script>
        </head>
        <body>
          <div class="supplier-chat">Made-in-China.com Supplier Chat</div>
          <div>Focus Technology Co., Ltd.</div>
        </body>
      </html>
    `;

    expect(extractSupplierName(html)).toBe(
      "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
    );
  });

  it("deduplicates aliases, promotes real variants and isolates packaging", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="China Misting System Mist Nozzles Outdoor Nozzles">
          <meta property="og:image" content="https://image.made-in-china.com/misting.jpg">
        </head>
        <body>
          <div class="compnay-name">
            <a href="https://mistingsystem.en.made-in-china.com">
              Ningbo Lisen Spray Technology Equipment Co., Ltd.
            </a>
          </div>
          <div>US$0.85 100-999 Pieces</div>
          <div>US$0.70 1,000-9,999 Pieces</div>
          <div>US$0.65 10,000+ Pieces</div>
          <div>FOB</div>
          <table>
            <tr><th>Name</th><td>misting system mist cooling system fog machine</td></tr>
            <tr><th>Product Name</th><td>Misting System</td></tr>
            <tr><th>Certificate</th><td>CE</td></tr>
            <tr><th>Certification</th><td>CE Certificate</td></tr>
            <tr><th>Keyword</th><td>High Pressure Fogger</td></tr>
            <tr><th>Keywords</th><td>Misting System, High Pressure Fogger</td></tr>
            <tr><th>Flow</th><td>0.1mm 0.2mm 0.3mm 0.4mm 0.5mm</td></tr>
            <tr><th>Voltage</th><td>110V/220V/380V</td></tr>
            <tr><th>Production Capacity</th><td>5,000 Units Per Year</td></tr>
            <tr><th>Customizable</th><td>Available</td></tr>
            <tr><th>Transport Package</th><td>Wooden</td></tr>
            <tr><th>Package Size</th><td>10.00cm * 10.00cm * 10.00cm</td></tr>
            <tr><th>Package Gross Weight</th><td>10.000kg</td></tr>
          </table>
        </body>
      </html>
    `;

    const details = extractMadeInChinaProductDetails(html);

    expect(details.adapter).toBe("made-in-china-product-page-v2");
    expect(details.attributes.filter((item) => item.name === "Product Name"))
      .toEqual([
        {
          name: "Product Name",
          value: "Misting System",
          category: "PRODUCT_SPECIFICATION",
        },
      ]);
    expect(details.attributes.filter((item) => item.name === "Certification"))
      .toEqual([
        {
          name: "Certification",
          value: "CE, CE Certificate",
          category: "PRODUCT_SPECIFICATION",
        },
      ]);
    expect(details.attributes.filter((item) => item.name === "Keywords"))
      .toEqual([
        {
          name: "Keywords",
          value: "High Pressure Fogger, Misting System",
          category: "PRODUCT_SPECIFICATION",
        },
      ]);
    expect(details.attributes).toContainEqual({
      name: "Production Capacity",
      value: "5,000 Units Per Year",
      category: "SUPPLIER_COMMERCIAL",
    });
    expect(details.attributes).toContainEqual({
      name: "Customization",
      value: "Available",
      category: "SUPPLIER_COMMERCIAL",
    });
    expect(details.attributes.some((item) => item.name === "Transport Package"))
      .toBe(false);
    expect(details.variants).toEqual([
      {
        name: "Flow",
        values: ["0.1 mm", "0.2 mm", "0.3 mm", "0.4 mm", "0.5 mm"],
      },
      {
        name: "Voltage",
        values: ["110 V", "220 V", "380 V"],
      },
    ]);
    expect(details.packaging).toMatchObject({
      packageType: "Wooden",
      packageLengthCm: 10,
      packageWidthCm: 10,
      packageHeightCm: 10,
      grossWeightKg: 10,
      scope: "UNKNOWN",
      confidence: "LOW",
      usableForLandedCost: false,
      validationNote: "Package dimensions and weight produce an implausible packaged density.",
    });
  });

  it("returns the supplier in the normalized preview", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="China Misting System Mist Nozzles Outdoor Nozzles">
          <meta property="og:image" content="https://image.made-in-china.com/misting.jpg">
        </head>
        <body>
          <div class="compnay-name">
            <a href="https://mistingsystem.en.made-in-china.com">
              Ningbo Lisen Spray Technology Equipment Co., Ltd.
            </a>
          </div>
          <div>US$0.85 100-999 Pieces</div>
          <div>FOB</div>
        </body>
      </html>
    `;

    expect(parseProductPreview(html, productUrl)).toMatchObject({
      supplierName: "Ningbo Lisen Spray Technology Equipment Co., Ltd.",
      price: "0.85",
      minimumOrderQuantity: "100",
    });
  });
});
