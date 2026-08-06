import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

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
      body: JSON.stringify({
        productQuery: "PTZ camera",
        quantity: 100,
        targetCountry: "RS",
        language: "sr",
      }),
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
      body: JSON.stringify({
        productQuery: "PTZ camera",
        quantity: 100,
        targetCountry: "RS",
        language: "sr",
      }),
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
      body: JSON.stringify({
        productQuery: "PTZ camera",
        quantity: 100,
        targetCountry: "RS",
        language: "en",
      }),
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
      body: JSON.stringify({
        productQuery: "PTZ camera",
        quantity: 100,
        targetCountry: "RS",
        language: "en",
      }),
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
});
