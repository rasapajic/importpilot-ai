import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseProductPreview } from "../src/parser.js";

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

  it("detects blocked pages clearly", () => {
    expect(() => parseProductPreview(
      fixture("blocked-page.html"),
      "https://www.alibaba.com/product-detail/Blocked-Charger_1600000000002.html",
    )).toThrow("BLOCKED");
  });
});
