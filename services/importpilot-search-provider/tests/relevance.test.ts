import { describe, expect, it } from "vitest";

import type { SupplierSearchResult } from "../src/contract.js";
import {
  coreProductTokens,
  rankRelevantSupplierResults,
} from "../src/relevance.js";

function result(title: string, index: number): SupplierSearchResult {
  return {
    title,
    supplierName: `Supplier ${index}`,
    supplierCountry: "CN",
    price: index + 1,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: `https://supplier-${index}.made-in-china.com/product-${index}.html`,
    imageUrl: null,
    source: "Made-in-China",
  };
}

describe("supplier search relevance", () => {
  it("ignores wholesale and manufacturer terms added for B2B query intent", () => {
    const providerQuery = "reading glasses +1.0 to +3.5 diopter wholesale manufacturer supplier";

    expect(coreProductTokens(providerQuery)).toEqual(["reading", "glass", "diopter"]);
    expect(rankRelevantSupplierResults(providerQuery, [
      result("Reading Glasses +1.00 +1.50 +2.00 +2.50 +3.00 +3.50", 1),
      result("Wholesale Manufacturer Supplier Catalog", 2),
      result("Greenhouse Equipment Kit", 3),
    ]).map((item) => item.title)).toEqual([
      "Reading Glasses +1.00 +1.50 +2.00 +2.50 +3.00 +3.50",
    ]);
  });
});
