import { describe, expect, it, vi } from "vitest";

import type { Supplier1688Enricher } from "../src/openai-1688-enrichment.js";
import {
  createOpenAI1688SearchSource,
  is1688ProductUrl,
  prepare1688ResultsForEnrichment,
} from "../src/openai-1688-search-source.js";
import type { SupplierSearchResult } from "../src/contract.js";

const offerUrl = "https://detail.1688.com/offer/555555.html";

function incompleteResult(): SupplierSearchResult {
  return {
    title: "Foldable organizer",
    supplierName: "1688 Factory",
    supplierCountry: null,
    price: 18.5,
    currency: "CNY",
    minimumOrderQuantity: 20,
    incoterm: null,
    productUrl: offerUrl,
    imageUrl: null,
    source: "TAJA 1688",
    supplierLogistics: {
      grossWeightKg: null,
      netWeightKg: null,
      cartonLengthCm: null,
      cartonWidthCm: null,
      cartonHeightCm: null,
      piecesPerCarton: null,
      unitWeightKg: null,
      unitVolumeCbm: null,
      evidence: "SEARCH_SNIPPET",
    },
  };
}

function discoveryResponse(result: SupplierSearchResult) {
  return {
    id: "resp_discovery_partial_logistics",
    status: "completed",
    output: [{
      type: "web_search_call",
      action: { type: "search", sources: [{ type: "url", url: offerUrl }] },
    }, {
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ results: [result] }),
        annotations: [{ type: "url_citation", url: offerUrl }],
      }],
    }],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

describe("TAJA 1688 partial logistics handoff", () => {
  it("accepts only genuine HTTPS 1688 offer-detail URLs", () => {
    expect(is1688ProductUrl("https://detail.1688.com/offer/123456.html")).toBe(true);
    expect(is1688ProductUrl("https://m.1688.com/offer/123456.htm?spm=tracking")).toBe(true);
    expect(is1688ProductUrl("https://s.1688.com/selloffer/offer_search.htm?keywords=fan")).toBe(false);
    expect(is1688ProductUrl("https://www.1688.com/")).toBe(false);
    expect(is1688ProductUrl("http://detail.1688.com/offer/123456.html")).toBe(false);
    expect(is1688ProductUrl("https://fake1688.com/offer/123456.html")).toBe(false);
  });

  it("strips unusable partial logistics before enrichment", () => {
    expect(prepare1688ResultsForEnrichment([incompleteResult()])[0]?.supplierLogistics)
      .toBeUndefined();
  });

  it("allows verified logistics to replace a partial discovery object", async () => {
    const discovered = incompleteResult();
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify(discoveryResponse(discovered)),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const enrich: Supplier1688Enricher["enrich"] = vi.fn(async ({ results }) => {
      expect(results[0]?.supplierLogistics).toBeUndefined();
      return {
        enrichedCount: 1,
        results: results.map((result) => ({
          ...result,
          supplierLogistics: {
            grossWeightKg: 12,
            netWeightKg: null,
            cartonLengthCm: 60,
            cartonWidthCm: 40,
            cartonHeightCm: 35,
            piecesPerCarton: 20,
            unitWeightKg: null,
            unitVolumeCbm: null,
            evidence: "PRODUCT_PAGE" as const,
          },
        })),
      };
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      enricher: { implemented: true, enrich },
    });

    const outcome = await source.search({
      productQuery: "foldable organizer",
      quantity: 100,
      targetCountry: "AT",
      language: "en",
    }, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results[0]?.supplierLogistics).toMatchObject({
      grossWeightKg: 12,
      piecesPerCarton: 20,
      evidence: "PRODUCT_PAGE",
    });
  });
});
