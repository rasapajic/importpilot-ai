import { describe, expect, it, vi } from "vitest";

import { createOpenAIWebSearchSource } from "../src/openai-web-search-source.js";

const input = {
  productQuery: "foldable car trunk organizer three compartments",
  quantity: 100,
  targetCountry: "RS",
  language: "sr" as const,
};

function result(productUrl: string, overrides: Record<string, unknown> = {}) {
  return {
    title: "Foldable car trunk organizer, 3 compartments",
    supplierName: "Ningbo Example Auto Accessories Co., Ltd.",
    supplierCountry: "cn",
    price: 4.8,
    currency: "usd",
    minimumOrderQuantity: 100,
    incoterm: "fob",
    productUrl,
    imageUrl: null,
    source: "Model supplied source",
    ...overrides,
  };
}

describe("OpenAI web supplier search source", () => {
  it("uses mandatory low-latency live web search, returns cited pages and reports cost", async () => {
    const citedUrl = "https://supplier.example.com/product/trunk-organizer?utm_source=openai";
    const uncitedUrl = "https://invented.example.com/product/not-cited";
    let requestBody: Record<string, unknown> | null = null;
    let clock = 1_000;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "resp_test",
        status: "completed",
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [{ type: "url", url: citedUrl }],
            },
          },
          {
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                results: [
                  result("https://supplier.example.com/product/trunk-organizer"),
                  result(uncitedUrl),
                ],
              }),
              annotations: [{ type: "url_citation", url: citedUrl }],
            }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      model: "gpt-5-mini",
      fetcher: fetcher as typeof fetch,
      logger: (event, details) => events.push({ event, details }),
      now: () => {
        const current = clock;
        clock += 250;
        return current;
      },
    });

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toEqual([
      expect.objectContaining({
        productUrl: "https://supplier.example.com/product/trunk-organizer",
        supplierCountry: "CN",
        currency: "USD",
        incoterm: "FOB",
        source: "TAJA web · supplier.example.com",
      }),
    ]);
    expect(outcome.aiUsage).toEqual([
      expect.objectContaining({
        provider: "openai",
        operation: "supplier_search",
        model: "gpt-5-mini",
        responseId: "resp_test",
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 50,
        reasoningOutputTokens: 10,
        totalTokens: 150,
        webSearchCalls: 1,
        durationMs: 250,
        inputCostUsd: 0.00002,
        cachedInputCostUsd: 0.0000005,
        outputCostUsd: 0.0001,
        webSearchCostUsd: 0.01,
        estimatedTotalCostUsd: 0.0101205,
        estimated: true,
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestBody).toMatchObject({
      model: "gpt-5-mini",
      store: false,
      reasoning: { effort: "minimal" },
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search", search_context_size: "low" }],
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(events).toContainEqual({
      event: "openai_web_search",
      details: expect.objectContaining({
        reasoning_effort: "minimal",
        search_context_size: "low",
        request_timeout_ms: 45_000,
        cited_sources: 1,
        parsed_results: 2,
        accepted_results: 1,
        cached_input_tokens: 20,
        reasoning_output_tokens: 10,
        total_tokens: 150,
        web_search_calls: 1,
        estimated_cost_usd: 0.0101205,
      }),
    });
  });

  it("accepts an explicitly configured reasoning effort", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      reasoningEffort: "low",
      fetcher: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          id: "resp_test",
          status: "completed",
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({ results: [] }),
              annotations: [],
            }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    await source.search(input, new AbortController().signal);
    expect(requestBody).toMatchObject({ reasoning: { effort: "low" } });
  });

  it("is disabled without an API key so direct providers can take over", async () => {
    const source = createOpenAIWebSearchSource();
    expect(source.implemented).toBe(false);
    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "OpenAI web search is not configured.",
    });
  });

  it("returns usage metadata when the model output has no matching web citation", async () => {
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      fetcher: async () => new Response(JSON.stringify({
        id: "resp_test_no_match",
        status: "completed",
        output: [{
          type: "web_search_call",
          action: { type: "search", sources: [] },
        }, {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              results: [result("https://invented.example.com/product/not-cited")],
            }),
            annotations: [],
          }],
        }],
        usage: { input_tokens: 50, output_tokens: 25, total_tokens: 75 },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");
    expect(outcome).toMatchObject({
      results: [],
      reason: "TAJA web search returned no cited sources.",
    });
    expect(outcome.aiUsage).toEqual([
      expect.objectContaining({
        responseId: "resp_test_no_match",
        totalTokens: 75,
        webSearchCalls: 1,
      }),
    ]);
  });

  it("uses a source-specific timeout without aborting the parent fallback budget", async () => {
    vi.useFakeTimers();
    try {
      const parent = new AbortController();
      const source = createOpenAIWebSearchSource({
        apiKey: "sk-test",
        requestTimeoutMs: 5_000,
        fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        }),
      });

      const search = source.search(input, parent.signal);
      const rejection = expect(search)
        .rejects.toThrow("OpenAI web search timed out after 5 seconds.");
      await vi.advanceTimersByTimeAsync(5_000);

      await rejection;
      expect(parent.signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
