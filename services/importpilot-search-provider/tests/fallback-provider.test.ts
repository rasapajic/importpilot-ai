import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createAlibabaSupplierSearchSource } from "../src/alibaba-source.js";
import { createMadeInChinaSupplierSearchSource } from "../src/made-in-china-provider.js";
import {
  createFallbackSupplierSearchSource,
  FALLBACK_UNAVAILABLE_REASON,
  type SupplierSearchSource,
} from "../src/provider.js";

const fixturePath = fileURLToPath(new URL("./fixtures/made-in-china-search.html", import.meta.url));
const input = { productQuery: "PTZ camera", quantity: 100, targetCountry: "RS", language: "sr" as const };

describe("supplier provider fallback chain", () => {
  it("falls back to Made-in-China when Alibaba is blocked", async () => {
    const fixture = await readFile(fixturePath, "utf8");
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createFallbackSupplierSearchSource([
      createAlibabaSupplierSearchSource({
        fetcher: async () => new Response("CAPTCHA verify you are human", { status: 200 }),
      }),
      createMadeInChinaSupplierSearchSource({
        fetcher: async () => new Response(fixture),
      }),
    ], (event, details) => events.push({ event, details }));

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(2);
    expect(Array.isArray(outcome) ? outcome[0] : outcome.results[0])
      .toMatchObject({ source: "Made-in-China" });
    expect(events).toContainEqual({
      event: "provider_attempt",
      details: { provider_name: "made-in-china-v1", parsed_results: 2, fallback_used: true },
    });
    expect(events).toContainEqual({
      event: "provider_final_result",
      details: {
        final_provider_used: "made-in-china-v1",
        final_result_count: 2,
        final_reason: null,
      },
    });
  });

  it("trusts TAJA semantic relevance when the user query and supplier title use different languages", async () => {
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const tajaSource: SupplierSearchSource = {
      name: "openai-web-search-v1",
      implemented: true,
      trustedRelevance: true,
      async search() {
        return {
          results: [{
            title: "Foldable Car Trunk Organizer with Three Compartments",
            supplierName: "Ningbo Example Auto Accessories Co., Ltd.",
            supplierCountry: "CN",
            price: 4.8,
            currency: "USD",
            minimumOrderQuantity: 100,
            incoterm: "FOB",
            productUrl: "https://supplier.example.com/product/trunk-organizer",
            imageUrl: null,
            source: "TAJA web · supplier.example.com",
          }],
        };
      },
    };
    const source = createFallbackSupplierSearchSource(
      [tajaSource],
      (event, details) => events.push({ event, details }),
    );

    const outcome = await source.search({
      productQuery: "sklopivi organizator za gepek sa tri pregrade",
      quantity: 100,
      targetCountry: "RS",
      language: "sr",
    }, new AbortController().signal);

    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
    expect(events).toContainEqual({
      event: "provider_relevance_filter",
      details: {
        provider_name: "openai-web-search-v1",
        parsed_results: 1,
        relevant_results: 1,
        semantic_relevance_trusted: true,
      },
    });
  });

  it("logs a sanitized provider error and continues the fallback chain", async () => {
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const failingSource: SupplierSearchSource = {
      name: "openai-web-search-v1",
      implemented: true,
      async search() {
        throw new Error("OpenAI returned 401 for Bearer sk-secret-value");
      },
    };
    const succeedingSource: SupplierSearchSource = {
      name: "made-in-china-v1",
      implemented: true,
      async search() {
        return {
          results: [{
            title: "PTZ Camera 3MP",
            supplierName: "Example Supplier",
            supplierCountry: "CN",
            price: 12,
            currency: "USD",
            minimumOrderQuantity: 100,
            incoterm: "FOB",
            productUrl: "https://supplier.example.com/product/ptz-camera",
            imageUrl: null,
            source: "Made-in-China",
          }],
        };
      },
    };
    const source = createFallbackSupplierSearchSource(
      [failingSource, succeedingSource],
      (event, details) => events.push({ event, details }),
    );

    const outcome = await source.search(input, new AbortController().signal);

    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
    expect(events).toContainEqual({
      event: "provider_attempt_failed",
      details: {
        provider_name: "openai-web-search-v1",
        error_name: "Error",
        error_message: "OpenAI returned 401 for Bearer [REDACTED]",
      },
    });
  });

  it("does not start more fallback sources after the global budget is aborted", async () => {
    const controller = new AbortController();
    let fallbackCalls = 0;
    const source = createFallbackSupplierSearchSource([
      {
        name: "openai-web-search-v1",
        implemented: true,
        async search() {
          controller.abort();
          throw new DOMException("Aborted", "AbortError");
        },
      },
      {
        name: "made-in-china-v1",
        implemented: true,
        async search() {
          fallbackCalls += 1;
          return [];
        },
      },
    ]);

    await expect(source.search(input, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fallbackCalls).toBe(0);
  });

  it("returns empty results when all providers fail", async () => {
    const failing = (name: string, reason: string): SupplierSearchSource => ({
      name,
      implemented: true,
      async search() {
        return { results: [], reason };
      },
    });
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createFallbackSupplierSearchSource([
      failing("alibaba-v1", "Alibaba blocked or rejected the search request."),
      failing("made-in-china-v1", "Made-in-China blocked or rejected the search request."),
    ], (event, details) => events.push({ event, details }));

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: FALLBACK_UNAVAILABLE_REASON,
    });
    expect(events).toContainEqual({
      event: "provider_final_result",
      details: {
        final_provider_used: null,
        final_result_count: 0,
        final_reason: FALLBACK_UNAVAILABLE_REASON,
      },
    });
  });
});
