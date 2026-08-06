import { describe, expect, it } from "vitest";

import {
  createHttpSupplierOfferSearchProvider,
  SupplierSearchProviderError,
  SupplierSearchProviderUnavailableError,
  SupplierSearchProviderResponseTooLargeError,
  SupplierSearchProviderTimeoutError,
} from "../../modules/product-search/infrastructure/http-provider";

const input = { query: "PTZ camera", quantity: 100, targetCountry: "RS" };
const result = {
  title: "3MP PTZ Camera",
  supplierName: "Camera Supplier",
  supplierCountry: "CN",
  price: 25,
  currency: "USD",
  minimumOrderQuantity: 50,
  incoterm: "FOB",
  productUrl: "https://supplier.example/ptz-camera",
  imageUrl: "https://supplier.example/ptz-camera.jpg",
  source: "supplier-provider",
};
const aiUsage = {
  provider: "openai" as const,
  operation: "supplier_search",
  model: "gpt-5-mini",
  responseId: "resp_usage_1",
  status: "completed" as const,
  inputTokens: 1_000,
  cachedInputTokens: 200,
  outputTokens: 500,
  reasoningOutputTokens: 100,
  totalTokens: 1_500,
  webSearchCalls: 1,
  durationMs: 2_500,
  currency: "USD" as const,
  pricingVersion: "openai-standard-2026-08-06",
  inputPricePerMillionUsd: 0.25,
  cachedInputPricePerMillionUsd: 0.025,
  outputPricePerMillionUsd: 2,
  webSearchPricePerCallUsd: 0.01,
  inputCostUsd: 0.0002,
  cachedInputCostUsd: 0.000005,
  outputCostUsd: 0.001,
  webSearchCostUsd: 0.01,
  estimatedTotalCostUsd: 0.011205,
  estimated: true as const,
};

describe("HTTP supplier search provider", () => {
  it("sends a server-side structured search request and validates real results", async () => {
    let receivedBody = "";
    let authorization = "";
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      token: "secret",
      fetcher: async (_url, init) => {
        receivedBody = String(init?.body);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return Response.json({ results: [result] });
      },
    });

    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([result]);
    expect(JSON.parse(receivedBody)).toEqual(input);
    expect(authorization).toBe("Bearer secret");
  });

  it("records validated AI usage returned with live results", async () => {
    const recorded: unknown[] = [];
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      onAiUsage: async (events) => recorded.push(...events),
      fetcher: async () => Response.json({ results: [result], aiUsage: [aiUsage] }),
    });

    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([result]);
    expect(recorded).toEqual([aiUsage]);
  });

  it("records AI usage even when no supplier result is returned", async () => {
    const recorded: unknown[] = [];
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      maxAttempts: 1,
      onAiUsage: async (events) => recorded.push(...events),
      fetcher: async () => Response.json({
        results: [],
        reason: "No verified direct supplier pages were found.",
        aiUsage: [aiUsage],
      }),
    });

    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderUnavailableError);
    expect(recorded).toEqual([aiUsage]);
  });

  it("does not fail the supplier search when cost persistence fails", async () => {
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      onAiUsage: async () => {
        throw new Error("Database unavailable");
      },
      fetcher: async () => Response.json({ results: [result], aiUsage: [aiUsage] }),
    });

    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([result]);
  });

  it("rejects non-HTTPS provider endpoints", () => {
    expect(() => createHttpSupplierOfferSearchProvider({
      endpoint: "http://search-provider.example/offers",
    })).toThrow(SupplierSearchProviderError);
  });

  it("rejects oversized responses", async () => {
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      maxResponseBytes: 10,
      fetcher: async () => Response.json({ results: [result] }),
    });
    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderResponseTooLargeError);
  });

  it("aborts slow providers", async () => {
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      timeoutMs: 5,
      fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    });
    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderTimeoutError);
  });

  it("retries an unavailable provider safely and then returns an error", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      retryDelayMs: 0,
      wait: async () => undefined,
      fetcher: async () => {
        calls += 1;
        throw new Error("Unavailable");
      },
    });

    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderError);
    expect(calls).toBe(2);
  });

  it("rejects an invalid provider response without caching it", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      fetcher: async () => {
        calls += 1;
        return Response.json({ results: [{ rawHtml: "<html />" }] });
      },
    });

    await expect(provider.searchSupplierOffers(input)).rejects.toThrow();
    await expect(provider.searchSupplierOffers(input)).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it("caches identical validated searches for ten minutes", async () => {
    let calls = 0;
    let time = 1_000;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      now: () => time,
      fetcher: async () => {
        calls += 1;
        return Response.json({ results: [result] });
      },
    });

    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([result]);
    time += 9 * 60 * 1_000;
    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([result]);
    expect(calls).toBe(1);
  });

  it("accepts and caches an empty provider response", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      fetcher: async () => {
        calls += 1;
        return Response.json({ results: [] });
      },
    });

    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([]);
    await expect(provider.searchSupplierOffers(input)).resolves.toEqual([]);
    expect(calls).toBe(1);
  });

  it("exposes the final provider-chain reason for a guided UI fallback", async () => {
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      maxAttempts: 1,
      fetcher: async () => Response.json({
        results: [],
        reason: "Alibaba blocked or rejected the search request.",
      }),
    });

    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderUnavailableError);
  });

  it("checks configured provider health without performing a search", async () => {
    const methods: string[] = [];
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/offers",
      healthEndpoint: "https://search-provider.example/health",
      fetcher: async (_url, init) => {
        methods.push(init?.method ?? "GET");
        return Response.json({ status: "ok" });
      },
    });

    await expect(provider.healthCheck?.()).resolves.toBe(true);
    expect(methods).toEqual(["GET"]);
  });
});
