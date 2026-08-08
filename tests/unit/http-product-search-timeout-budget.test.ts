import { describe, expect, it } from "vitest";

import {
  createHttpSupplierOfferSearchProvider,
  SUPPLIER_SEARCH_TIMEOUT_MS,
  SupplierSearchProviderHttpError,
  SupplierSearchProviderTimeoutError,
} from "../../modules/product-search/infrastructure/http-provider";

const input = { query: "foldable organizer", quantity: 100, targetCountry: "AT" };

describe("deep supplier-search timeout budget", () => {
  it("waits longer than the search service aggregate budget", () => {
    expect(SUPPLIER_SEARCH_TIMEOUT_MS).toBeGreaterThan(90_000);
  });

  it("does not repeat an expensive request after the local timeout", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/search",
      timeoutMs: 5,
      maxAttempts: 2,
      retryDelayMs: 0,
      wait: async () => undefined,
      fetcher: async (_url, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    });

    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderTimeoutError);
    expect(calls).toBe(1);
  });

  it("does not repeat a service-side 504 after its full search budget", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/search",
      maxAttempts: 2,
      retryDelayMs: 0,
      wait: async () => undefined,
      fetcher: async () => {
        calls += 1;
        return Response.json({ error: "Supplier search source timed out." }, { status: 504 });
      },
    });

    await expect(provider.searchSupplierOffers(input))
      .rejects.toBeInstanceOf(SupplierSearchProviderHttpError);
    expect(calls).toBe(1);
  });
});
