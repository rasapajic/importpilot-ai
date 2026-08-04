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
});
