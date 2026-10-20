import { describe, expect, it } from "vitest";

import type { SupplierSearchResult } from "../../services/importpilot-search-provider/src/contract";
import { createSupplierSearchQueryVariants } from "../../services/importpilot-search-provider/src/query-variants";
import {
  coreProductTokens,
  rankRelevantSupplierResults,
} from "../../services/importpilot-search-provider/src/relevance";

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
  const query = "Foldable car trunk organizer, 3 compartments, black polyester";

  it("extracts product concepts instead of colors, materials and modifiers", () => {
    expect(coreProductTokens(query)).toEqual(["car", "trunk", "organizer"]);
  });

  it("rejects seat belts and raw fabric for a car trunk organizer query", () => {
    const ranked = rankRelevantSupplierResults(query, [
      result("OEM Automatic Car Seat Belt Safety Belt 3 Points Polyester", 1),
      result("100% Polyester Oxford Black Fabric for Luggage", 2),
      result("Foldable Car Trunk Organizer with Three Compartments", 3),
      result("Vehicle Cargo Organizer Storage Box", 4),
      result("Collapsible Trunk Storage Bag for Car", 5),
    ]);

    expect(ranked.map((item) => item.title)).toEqual([
      "Foldable Car Trunk Organizer with Three Compartments",
      "Vehicle Cargo Organizer Storage Box",
      "Collapsible Trunk Storage Bag for Car",
    ]);
  });

  it("keeps short broad queries backward compatible", () => {
    const candidates = [
      result("Creative Home Storage Organizer", 1),
      result("Kitchen Drawer Storage Box", 2),
    ];

    expect(rankRelevantSupplierResults("storage organizer", candidates)).toHaveLength(2);
  });

  it("prioritizes a focused car trunk organizer provider query", () => {
    expect(createSupplierSearchQueryVariants(query)[0]).toBe("car trunk organizer");
  });

  it("does not require B2B sourcing boilerplate before a product title can match", () => {
    const providerQuery = "reading glasses +1.0 to +3.5 diopter wholesale manufacturer supplier";

    expect(coreProductTokens(providerQuery)).toEqual(["reading", "glass", "diopter"]);
    expect(rankRelevantSupplierResults(providerQuery, [
      result("Reading Glasses +1.00 +1.50 +2.00 +2.50 +3.00 +3.50", 1),
      result("Wholesale Manufacturer Supplier Catalog", 2),
      result("Plastic Food Container 500ml", 3),
    ], 10).map((item) => item.title)).toEqual([
      "Reading Glasses +1.00 +1.50 +2.00 +2.50 +3.00 +3.50",
    ]);
  });

  it("keeps an on-topic greenhouse title when the provider query includes sourcing terms", () => {
    const providerQuery = "greenhouse equipment and accessories wholesale manufacturer supplier";

    expect(rankRelevantSupplierResults(providerQuery, [
      result("Greenhouse Equipment Kit", 1),
      result("Car Trunk Organizer", 2),
    ], 10).map((item) => item.title)).toEqual([
      "Greenhouse Equipment Kit",
    ]);
  });
});
