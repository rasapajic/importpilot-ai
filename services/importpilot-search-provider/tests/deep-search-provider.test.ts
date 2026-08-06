import { describe, expect, it, vi } from "vitest";

import { createOpenAI1688SearchSource } from "../src/openai-1688-search-source.js";
import {
  createAggregatingSupplierSearchSource,
  type SupplierSearchSource,
} from "../src/provider.js";

const input = {
  productQuery: "foldable car trunk organizer",
  quantity: 100,
  targetCountry: "RS",
  language: "sr" as const,
};

function result(
  title: string,
  supplierName: string,
  productUrl: string,
  source: string,
) {
  return {
    title,
    supplierName,
    supplierCountry: "CN",
    price: 5,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source,
  };
}

function trustedSource(
  name: string,
  results: ReturnType<typeof result>[],
  calls: string[],
): SupplierSearchSource {
  return {
    name,
    implemented: true,
    trustedRelevance: true,
    async search() {
      calls.push(name);
      return { results };
    },
  };
}

describe("TAJA Deep Search phase 1", () => {
  it("runs every source, removes duplicates and preserves source diversity", async () => {
    const calls: string[] = [];
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createAggregatingSupplierSearchSource([
      trustedSource("openai-web", [
        result(
          "Organizer model A",
          "Supplier A",
          "https://supplier-a.example.com/product/organizer?utm_source=taja",
          "TAJA web",
        ),
        result(
          "Shared organizer",
          "Shared Factory",
          "https://shared.example.com/product/organizer?spm=123",
          "TAJA web",
        ),
      ], calls),
      trustedSource("openai-1688", [
        result(
          "Shared organizer",
          "Shared Factory",
          "https://shared.example.com/product/organizer",
          "TAJA 1688",
        ),
        result(
          "Organizer model B",
          "Supplier B",
          "https://detail.1688.com/offer/123456.html",
          "TAJA 1688",
        ),
      ], calls),
      trustedSource("made-in-china", [
        result(
          "Organizer model C",
          "Supplier C",
          "https://supplier-c.example.com/product/organizer",
          "Made-in-China",
        ),
      ], calls),
    ], { maxResults: 30, maxResultsPerSource: 15 },
    (event, details) => events.push({ event, details }));

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(calls.sort()).toEqual(["made-in-china", "openai-1688", "openai-web"]);
    expect(outcome.results).toHaveLength(4);
    expect(outcome.results.map((candidate) => candidate.source)).toEqual([
      "TAJA web",
      "Made-in-China",
      "TAJA web",
      "TAJA 1688",
    ]);
    expect(events).toContainEqual({
      event: "provider_aggregation_complete",
      details: expect.objectContaining({
        configured_sources: 3,
        successful_sources: 3,
        relevant_candidates: 5,
        duplicate_results_removed: 1,
        final_result_count: 4,
      }),
    });
  });

  it("keeps useful results when one source fails", async () => {
    const source = createAggregatingSupplierSearchSource([
      {
        name: "failing-source",
        implemented: true,
        async search() {
          throw new Error("Source unavailable");
        },
      },
      trustedSource("working-source", [
        result(
          "Organizer model A",
          "Supplier A",
          "https://supplier-a.example.com/product/organizer",
          "Working source",
        ),
      ], []),
    ]);

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
  });

  it("runs a dedicated 1688 query and accepts only verified 1688 product pages", async () => {
    const direct1688Url = "https://detail.1688.com/offer/123456789.html";
    const alibabaUrl = "https://www.alibaba.com/product-detail/example.html";
    let requestBody = "";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        id: "resp_1688",
        status: "completed",
        output: [{
          type: "web_search_call",
          action: {
            type: "search",
            sources: [
              { type: "url", url: direct1688Url },
              { type: "url", url: alibabaUrl },
            ],
          },
        }, {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              results: [
                result("1688 organizer", "1688 Factory", direct1688Url, "model"),
                result("Alibaba organizer", "Alibaba Factory", alibabaUrl, "model"),
              ],
            }),
            annotations: [
              { type: "url_citation", url: direct1688Url },
              { type: "url_citation", url: alibabaUrl },
            ],
          }],
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toEqual([
      expect.objectContaining({
        productUrl: direct1688Url,
        source: "TAJA 1688",
      }),
    ]);
    expect(requestBody).toContain("site:1688.com");
    expect(requestBody).toContain("中国");
  });
});
