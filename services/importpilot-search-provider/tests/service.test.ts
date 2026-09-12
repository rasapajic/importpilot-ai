import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSearchProviderApp } from "../src/app.js";
import type { SupplierSearchSource } from "../src/provider.js";

const token = "test-provider-token";
const servers: ReturnType<typeof createServer>[] = [];
const aiUsage = {
  provider: "openai" as const,
  operation: "supplier_search" as const,
  model: "gpt-5-mini",
  responseId: "resp_service_test",
  status: "completed" as const,
  inputTokens: 100,
  cachedInputTokens: 20,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
  webSearchCalls: 1,
  durationMs: 500,
  currency: "USD" as const,
  pricingVersion: "openai-standard-2026-08-06",
  inputPricePerMillionUsd: 0.25,
  cachedInputPricePerMillionUsd: 0.025,
  outputPricePerMillionUsd: 2,
  webSearchPricePerCallUsd: 0.01,
  inputCostUsd: 0.00002,
  cachedInputCostUsd: 0.0000005,
  outputCostUsd: 0.0001,
  webSearchCostUsd: 0.01,
  estimatedTotalCostUsd: 0.0101205,
  estimated: true as const,
};
const validSearchInput = {
  productQuery: "PTZ camera",
  quantity: 100,
  targetCountry: "RS",
  language: "sr",
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function start(source?: SupplierSearchSource) {
  const server = createServer(createSearchProviderApp({ token, source }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function startWithLogger(
  source: SupplierSearchSource,
  logger: (event: string, details?: Record<string, unknown>) => void,
) {
  const server = createServer(createSearchProviderApp({ token, source, logger }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function request(baseUrl: string, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(
    (server) => new Promise<void>((resolve) => server.close(() => resolve())),
  ));
});

describe("ImportPilot Search Provider service", () => {
  it("requires bearer authentication", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/search`, { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("rejects invalid search input", async () => {
    const baseUrl = await start();
    const response = await request(baseUrl, "/search", {
      method: "POST",
      body: JSON.stringify({ productQuery: "", quantity: 0, targetCountry: "Serbia" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid search request." });
  });

  it("returns a clear empty response when no real source is implemented", async () => {
    const baseUrl = await start();
    const response = await request(baseUrl, "/search", {
      method: "POST",
      body: JSON.stringify(validSearchInput),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [],
      reason: "No real supplier-search source is configured.",
    });
  });

  it("returns validated AI usage metadata with search results", async () => {
    const source: SupplierSearchSource = {
      name: "ai-source",
      implemented: true,
      async search() {
        return { results: [], reason: "No offers.", aiUsage: [aiUsage] };
      },
    };
    const baseUrl = await start(source);
    const response = await request(baseUrl, "/search", {
      method: "POST",
      body: JSON.stringify(validSearchInput),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [],
      reason: "No offers.",
      aiUsage: [aiUsage],
    });
  });

  it("rejects invalid implemented provider responses", async () => {
    const source: SupplierSearchSource = {
      name: "invalid-source",
      implemented: true,
      async search() {
        return [{ rawHtml: "<html />" }] as never;
      },
    };
    const baseUrl = await start(source);
    const response = await request(baseUrl, "/search", {
      method: "POST",
      body: JSON.stringify({ ...validSearchInput, language: "en" }),
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "Supplier search source returned an invalid or unavailable response.",
    });
  });

  it("reports health for the configured source", async () => {
    const source: SupplierSearchSource = {
      name: "healthy-source",
      implemented: true,
      async search() {
        return [];
      },
      async healthCheck() {
        return true;
      },
    };
    const baseUrl = await start(source);
    const response = await request(baseUrl, "/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      source: "healthy-source",
      implemented: true,
    });
  });

  it("logs validated search details and empty reason without authorization tokens", async () => {
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source: SupplierSearchSource = {
      name: "empty-source",
      implemented: true,
      async search() {
        return { results: [], reason: "No supplier offers found." };
      },
    };
    const baseUrl = await startWithLogger(
      source,
      (event, details) => events.push({ event, details }),
    );
    const response = await request(baseUrl, "/search", {
      method: "POST",
      body: JSON.stringify({ ...validSearchInput, language: "en" }),
    });

    expect(response.status).toBe(200);
    expect(events).toContainEqual({
      event: "search_request_received",
      details: {
        productQuery: "PTZ camera",
        quantity: 100,
        targetCountry: "RS",
      },
    });
    expect(events).toContainEqual({
      event: "search_results",
      details: {
        resultCount: 0,
        reason: "No supplier offers found.",
      },
    });
    expect(JSON.stringify(events)).not.toContain(token);
  });

  it("coalesces concurrent identical requests so the paid source runs once", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const search = vi.fn(async () => {
      started.resolve();
      await release.promise;
      return { results: [], reason: "No offers." };
    });
    const source: SupplierSearchSource = {
      name: "paid-source",
      implemented: true,
      search,
    };
    const baseUrl = await start(source);
    const init: RequestInit = {
      method: "POST",
      headers: { "idempotency-key": "same-paid-search-123" },
      body: JSON.stringify(validSearchInput),
    };

    const first = request(baseUrl, "/search", init);
    await started.promise;
    const second = request(baseUrl, "/search", init);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release.resolve();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(search).toHaveBeenCalledTimes(1);
    expect(firstResponse.headers.get("x-importpilot-idempotency")).toBe("new");
    expect(secondResponse.headers.get("x-importpilot-idempotency"))
      .toBe("in-flight-coalesced");
    await expect(firstResponse.json()).resolves.toEqual({
      results: [],
      reason: "No offers.",
    });
    await expect(secondResponse.json()).resolves.toEqual({
      results: [],
      reason: "No offers.",
    });
  });

  it("replays a recently completed identical request without another source call", async () => {
    const search = vi.fn(async () => ({ results: [], reason: "No offers." }));
    const source: SupplierSearchSource = {
      name: "paid-source",
      implemented: true,
      search,
    };
    const baseUrl = await start(source);
    const init: RequestInit = {
      method: "POST",
      headers: { "idempotency-key": "completed-paid-search-123" },
      body: JSON.stringify(validSearchInput),
    };

    const firstResponse = await request(baseUrl, "/search", init);
    const secondResponse = await request(baseUrl, "/search", init);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(search).toHaveBeenCalledTimes(1);
    expect(firstResponse.headers.get("x-importpilot-idempotency")).toBe("new");
    expect(secondResponse.headers.get("x-importpilot-idempotency"))
      .toBe("completed-replay");
  });

  it("does not reuse an idempotency key for a different validated request body", async () => {
    const search = vi.fn(async () => ({ results: [], reason: "No offers." }));
    const source: SupplierSearchSource = {
      name: "paid-source",
      implemented: true,
      search,
    };
    const baseUrl = await start(source);
    const headers = { "idempotency-key": "shared-key-different-body" };

    await request(baseUrl, "/search", {
      method: "POST",
      headers,
      body: JSON.stringify(validSearchInput),
    });
    await request(baseUrl, "/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...validSearchInput, quantity: 200 }),
    });

    expect(search).toHaveBeenCalledTimes(2);
  });
});
