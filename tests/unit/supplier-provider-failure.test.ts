import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createHttpSupplierOfferSearchProvider,
  SupplierSearchProviderError,
  SupplierSearchProviderHttpError,
  SupplierSearchProviderInvalidResponseError,
} from "../../modules/product-search/infrastructure/http-provider";
import {
  classifySupplierSearchProviderFailure,
  supplierSearchProviderFailureLog,
} from "../../modules/product-search/infrastructure/provider-failure";

const input = { query: "reading glasses", quantity: 500, targetCountry: "RS" };

function providerWith(status: number) {
  return createHttpSupplierOfferSearchProvider({
    endpoint: "https://search-provider.example/search",
    token: "secret-token",
    maxAttempts: 2,
    retryDelayMs: 0,
    wait: async () => undefined,
    fetcher: async () => Response.json({ error: "hidden" }, { status }),
  });
}

describe("supplier provider failure classification", () => {
  it("distinguishes authorization, missing path, and other HTTP statuses", async () => {
    const unauthorized = await providerWith(401).searchSupplierOffers(input).catch((error: unknown) => error);
    const forbidden = await providerWith(403).searchSupplierOffers(input).catch((error: unknown) => error);
    const missing = await providerWith(404).searchSupplierOffers(input).catch((error: unknown) => error);
    const badRequest = await providerWith(400).searchSupplierOffers(input).catch((error: unknown) => error);

    expect(unauthorized).toBeInstanceOf(SupplierSearchProviderHttpError);
    expect(classifySupplierSearchProviderFailure(unauthorized)).toEqual({
      providerFailure: "auth",
      providerHttpStatus: 401,
    });
    expect(classifySupplierSearchProviderFailure(forbidden)).toEqual({
      providerFailure: "auth",
      providerHttpStatus: 403,
    });
    expect(classifySupplierSearchProviderFailure(missing)).toEqual({
      providerFailure: "not_found",
      providerHttpStatus: 404,
    });
    expect(classifySupplierSearchProviderFailure(badRequest)).toEqual({
      providerFailure: "http_error",
      providerHttpStatus: 400,
    });
  });

  it("does not retry an authorization or not-found response", async () => {
    let calls = 0;
    const provider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/search",
      maxAttempts: 3,
      retryDelayMs: 0,
      wait: async () => undefined,
      fetcher: async () => {
        calls += 1;
        return Response.json({ error: "Unauthorized." }, { status: 401 });
      },
    });

    await expect(provider.searchSupplierOffers(input)).rejects.toBeInstanceOf(SupplierSearchProviderHttpError);
    expect(calls).toBe(1);
  });

  it("classifies a dropped connection separately from an invalid provider body", async () => {
    const networkProvider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/search",
      maxAttempts: 1,
      fetcher: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const invalidProvider = createHttpSupplierOfferSearchProvider({
      endpoint: "https://search-provider.example/search",
      maxAttempts: 1,
      fetcher: async () => new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    const network = await networkProvider.searchSupplierOffers(input).catch((error: unknown) => error);
    const invalid = await invalidProvider.searchSupplierOffers(input).catch((error: unknown) => error);

    expect(network).toBeInstanceOf(SupplierSearchProviderError);
    expect(network).not.toBeInstanceOf(SupplierSearchProviderHttpError);
    expect(classifySupplierSearchProviderFailure(network)).toEqual({
      providerFailure: "network",
      providerHttpStatus: null,
    });
    expect(invalid).toBeInstanceOf(SupplierSearchProviderInvalidResponseError);
    expect(classifySupplierSearchProviderFailure(invalid)).toEqual({
      providerFailure: "invalid_response",
      providerHttpStatus: null,
    });
  });

  it("classifies an insecure provider URL without recording the address", () => {
    let thrown: unknown;
    try {
      createHttpSupplierOfferSearchProvider({
        endpoint: "http://search-provider.example/search",
      });
    } catch (error) {
      thrown = error;
    }

    expect(classifySupplierSearchProviderFailure(thrown)).toEqual({
      providerFailure: "configuration",
      providerHttpStatus: null,
    });
    expect(JSON.stringify(supplierSearchProviderFailureLog({
      durationMs: 800,
      error: thrown,
    }))).not.toContain("search-provider.example");
  });

  it("logs only the failure class, status, and duration", () => {
    const entry = supplierSearchProviderFailureLog({
      durationMs: 800,
      error: new SupplierSearchProviderHttpError(401),
    });

    expect(entry).toEqual({
      service: "importpilot-app",
      event: "supplier_search_provider_failure",
      duration_ms: 800,
      provider_failure: "auth",
      provider_http_status: 401,
    });
    expect(Object.keys(entry).sort()).toEqual([
      "duration_ms",
      "event",
      "provider_failure",
      "provider_http_status",
      "service",
    ]);
  });

  it("returns the safe failure fields from the supplier-search route", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/projects/[projectId]/supplier-search/route.ts"),
      "utf8",
    );
    const logger = readFileSync(
      join(process.cwd(), "modules/product-search/infrastructure/provider-failure.ts"),
      "utf8",
    );

    expect(route).toContain("classifySupplierSearchProviderFailure(error)");
    expect(route).toContain("...providerFailure");
    expect(logger).not.toContain("productQuery");
    expect(logger).not.toContain("authorization");
    expect(logger).not.toContain("password");
    expect(logger).not.toContain("SUPPLIER_SEARCH_PROVIDER_TOKEN");
  });
});
