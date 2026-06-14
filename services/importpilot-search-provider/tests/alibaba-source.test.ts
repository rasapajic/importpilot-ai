import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createAlibabaSupplierSearchSource,
  parseAlibabaSearchHtml,
} from "../src/alibaba-source.js";

const fixturePath = fileURLToPath(new URL("./fixtures/alibaba-search.html", import.meta.url));
const input = {
  productQuery: "PTZ camera",
  quantity: 100,
  targetCountry: "RS",
  language: "sr" as const,
};

describe("Alibaba supplier search source", () => {
  it("parses and normalizes a saved Alibaba HTML fixture", async () => {
    const results = parseAlibabaSearchHtml(await readFile(fixturePath, "utf8"));

    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({
      title: "3MP Outdoor PTZ Camera",
      supplierName: "Shenzhen Vision Supplier",
      supplierCountry: "CN",
      price: 25.5,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      productUrl: "https://www.alibaba.com/product-detail/ptz-camera-1.html",
      imageUrl: "https://s.alicdn.com/ptz-camera-1.jpg",
      source: "Alibaba",
    });
    expect(results[1]).toMatchObject({
      currency: "EUR",
      minimumOrderQuantity: 50,
      incoterm: null,
    });
    expect(results[2]).toMatchObject({ currency: "CNY", incoterm: "CIF" });
    expect(results[3]).toMatchObject({
      currency: "GBP",
      minimumOrderQuantity: null,
      incoterm: null,
      imageUrl: null,
    });
  });

  it("returns empty results with a reason when Alibaba blocks the request", async () => {
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createAlibabaSupplierSearchSource({
      fetcher: async () => new Response("Verify you are human CAPTCHA", { status: 403 }),
      logger: (event, details) => events.push({ event, details }),
    });

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "Alibaba blocked or rejected the search request.",
    });
    expect(events).toContainEqual({
      event: "upstream_response",
      details: expect.objectContaining({ provider_name: "alibaba-v1", upstream_status: 403 }),
    });
    expect(events).toContainEqual({
      event: "upstream_block_detection",
      details: { provider_name: "alibaba-v1", blocked: true },
    });
    expect(events).toContainEqual({
      event: "upstream_parse_complete",
      details: { provider_name: "alibaba-v1", parsed_results: 0 },
    });
  });

  it("returns empty results with a reason when parsing produces no offers", async () => {
    const source = createAlibabaSupplierSearchSource({
      fetcher: async () => new Response("<html><body>No structured products</body></html>"),
    });

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "Alibaba returned no parseable supplier offers.",
    });
  });

  it("uses only saved fixture HTML in adapter tests", async () => {
    const html = await readFile(fixturePath, "utf8");
    let requestedUrl = "";
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createAlibabaSupplierSearchSource({
      fetcher: async (url) => {
        requestedUrl = String(url);
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
      logger: (event, details) => events.push({ event, details }),
    });

    const outcome = await source.search(input, new AbortController().signal);
    expect(requestedUrl).toContain("SearchText=PTZ+camera");
    expect(Array.isArray(outcome)).toBe(false);
    expect(outcome).toMatchObject({ results: expect.any(Array) });
    expect(events).toContainEqual({
      event: "upstream_request",
      details: { provider_name: "alibaba-v1", upstreamUrl: requestedUrl },
    });
    expect(events).toContainEqual({
      event: "upstream_parse_complete",
      details: { provider_name: "alibaba-v1", parsed_results: 5 },
    });
  });
});
