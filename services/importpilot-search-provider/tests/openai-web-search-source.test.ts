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
  it("uses mandatory live web search and accepts only cited direct product pages", async () => {
    const citedUrl = "https://supplier.example.com/product/trunk-organizer?utm_source=openai";
    const uncitedUrl = "https://invented.example.com/product/not-cited";
    let requestBody: Record<string, unknown> | null = null;
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
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      model: "gpt-5",
      fetcher: fetcher as typeof fetch,
      logger: (event, details) => events.push({ event, details }),
    });

    const outcome = await source.search(input, new AbortController().signal);
    const results = Array.isArray(outcome) ? outcome : outcome.results;

    expect(results).toEqual([
      expect.objectContaining({
        productUrl: "https://supplier.example.com/product/trunk-organizer",
        supplierCountry: "CN",
        currency: "USD",
        incoterm: "FOB",
        source: "TAJA web · supplier.example.com",
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestBody).toMatchObject({
      model: "gpt-5",
      store: false,
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search", search_context_size: "medium" }],
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(events).toContainEqual({
      event: "openai_web_search",
      details: expect.objectContaining({
        search_context_size: "medium",
        request_timeout_ms: 45_000,
        cited_sources: 1,
        parsed_results: 2,
        accepted_results: 1,
        total_tokens: 150,
      }),
    });
  });

  it("is disabled without an API key so direct providers can take over", async () => {
    const source = createOpenAIWebSearchSource();
    expect(source.implemented).toBe(false);
    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "OpenAI web search is not configured.",
    });
  });

  it("returns no offers when the model output has no matching web citation", async () => {
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      fetcher: async () => new Response(JSON.stringify({
        id: "resp_test",
        status: "completed",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              results: [result("https://invented.example.com/product/not-cited")],
            }),
            annotations: [],
          }],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "TAJA web search returned no cited sources.",
    });
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
