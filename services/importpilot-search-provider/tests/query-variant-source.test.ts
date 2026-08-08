import { describe, expect, it } from "vitest";

import type {
  SearchRequest,
  SupplierSearchResult,
} from "../src/contract.js";
import type { SupplierSearchSource } from "../src/provider.js";
import { createQueryVariantExpandingSource } from "../src/query-variant-source.js";

const input: SearchRequest = {
  productQuery: "patio misting system with pump 20 nozzles",
  queryVariants: [
    "patio misting system with pump 20 nozzles",
    "outdoor mist cooling kit pump 20 nozzles",
    "terrace misting system 20 nozzles pump kit",
    "patio misting cooling system",
  ],
  chinese1688QueryVariants: [],
  quantity: 100,
  targetCountry: "AT",
  language: "sr",
};

function result(
  title: string,
  productUrl: string,
): SupplierSearchResult {
  return {
    title,
    supplierName: "Example Misting Factory",
    supplierCountry: "CN",
    price: 10,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "Direct marketplace",
  };
}

describe("direct supplier source query expansion", () => {
  it("executes every prepared variant and ranks the exact result above generic pages", async () => {
    const calls: string[] = [];
    const underlying: SupplierSearchSource = {
      name: "made-in-china-test",
      implemented: true,
      async search(variantInput) {
        calls.push(variantInput.productQuery);
        if (variantInput.productQuery.startsWith("terrace")) {
          return {
            results: [result(
              "Terrace Misting System Kit with Pump and 20 Misting Nozzles",
              "https://supplier.example/exact",
            )],
          };
        }
        return {
          results: [result(
            "Outdoor Misting Cooling System with Pump Mist Nozzles",
            `https://supplier.example/generic-${calls.length}`,
          )],
        };
      },
    };
    const source = createQueryVariantExpandingSource(underlying);

    const outcome = await source.search(input, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(calls).toEqual(input.queryVariants);
    expect(outcome.results[0]).toMatchObject({
      title: "Terrace Misting System Kit with Pump and 20 Misting Nozzles",
      productUrl: "https://supplier.example/exact",
    });
    expect(outcome.results.length).toBeGreaterThan(1);
  });

  it("keeps successful variants when one direct-marketplace request fails", async () => {
    const underlying: SupplierSearchSource = {
      name: "alibaba-test",
      implemented: true,
      async search(variantInput) {
        if (variantInput.productQuery.includes("outdoor mist")) {
          throw new Error("Temporary marketplace failure");
        }
        return {
          results: [result(
            variantInput.productQuery.includes("terrace")
              ? "Terrace Misting System Kit with Pump and 20 Nozzles"
              : "Patio Misting System with Pump",
            `https://supplier.example/${encodeURIComponent(variantInput.productQuery)}`,
          )],
        };
      },
    };
    const source = createQueryVariantExpandingSource(underlying);

    const outcome = await source.search(input, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Terrace Misting System Kit with Pump and 20 Nozzles",
      }),
    ]));
  });

  it("deduplicates the same product returned by multiple variants", async () => {
    const repeated = result(
      "Patio Misting System with Pump and 20 Nozzles",
      "https://supplier.example/repeated?utm_source=first",
    );
    const underlying: SupplierSearchSource = {
      name: "duplicate-test",
      implemented: true,
      async search(variantInput) {
        return {
          results: [{
            ...repeated,
            productUrl: variantInput.productQuery.includes("terrace")
              ? "https://supplier.example/repeated"
              : repeated.productUrl,
          }],
        };
      },
    };
    const source = createQueryVariantExpandingSource(underlying);

    const outcome = await source.search(input, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toHaveLength(1);
  });
});
