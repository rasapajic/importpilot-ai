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
