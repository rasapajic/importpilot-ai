import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createUrlImportProviderApp } from "../src/app.js";

let server: Server | undefined;

const fixturePath = (...parts: string[]) => join(import.meta.dirname, "fixtures", ...parts);
const fixture = (name: string) => readFileSync(fixturePath(name), "utf8");

async function start(options: Parameters<typeof createUrlImportProviderApp>[0] = {}) {
  server = createServer(createUrlImportProviderApp(options));
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve());
  });
  server = undefined;
});

describe("URL import provider API", () => {
  it("returns health", async () => {
    const baseUrl = await start({ token: "dev-url-import-token" });
    await expect(fetch(`${baseUrl}/health`).then((response) => response.json())).resolves.toEqual({ ok: true });
  });

  it("returns verbose health diagnostics", async () => {
    const baseUrl = await start({
      fetcher: async () => htmlResponse("<html>ok</html>"),
    });
    const response = await fetch(`${baseUrl}/health?verbose=1`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      providerVersion: "0.1.0",
      outboundFetchCapability: "ok",
    });
  });

  it("returns production diagnostics", async () => {
    const baseUrl = await start({
      fetcher: async () => htmlResponse("<html>ok</html>"),
    });
    const response = await fetch(`${baseUrl}/diagnostics`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providerVersion: "0.1.0",
      dnsTestResult: expect.any(Object),
      httpsTestResult: expect.any(Object),
    });
  });

  it("requires bearer token when configured", async () => {
    const baseUrl = await start({ token: "dev-url-import-token" });
    const response = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productUrl: "https://www.alibaba.com/product-detail/Charger_1600000000001.html" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns preview data for a valid Alibaba product URL", async () => {
    const baseUrl = await start({
      token: "dev-url-import-token",
      fetcher: async () => htmlResponse(fixture("alibaba-product-detail.html")),
    });

    const response = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: {
        "authorization": "Bearer dev-url-import-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ productUrl: "https://www.alibaba.com/product-detail/Factory-65W-USB-C-GaN-Charger_1600000000001.html" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        productTitle: "Factory 65W USB C GaN Charger",
        supplierName: "Shenzhen Reliable Power Co., Ltd.",
        price: "4.80",
        currency: "USD",
      },
    });
  });

  it("returns INVALID_URL for invalid or unsupported URLs", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productUrl: "https://example.com/product" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: "INVALID_URL" });
  });

  it("returns BLOCKED when upstream page is a CAPTCHA or anti-bot page", async () => {
    const baseUrl = await start({
      fetcher: async () => htmlResponse(fixture("blocked-page.html")),
    });
    const response = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productUrl: "https://www.alibaba.com/product-detail/Blocked-Charger_1600000000002.html" }),
    });

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({ reason: "BLOCKED" });
  });

  it("records the last fetch error for diagnostics", async () => {
    const baseUrl = await start({
      fetcher: async () => {
        throw new TypeError("fetch failed", { cause: new Error("connect ETIMEDOUT 203.0.113.10:443") });
      },
    });

    const previewResponse = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productUrl: "https://www.alibaba.com/product-detail/Timeout-Charger_1600000000003.html" }),
    });
    expect(previewResponse.status).toBe(502);

    const diagnostics = await fetch(`${baseUrl}/diagnostics`).then((response) => response.json()) as {
      lastFetchError?: { reason?: string; errorName?: string };
    };
    expect(diagnostics.lastFetchError).toMatchObject({
      reason: "FETCH_FAILURE",
      errorName: "TypeError",
    });
  });
});
