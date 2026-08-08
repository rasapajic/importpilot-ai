import { describe, expect, it, vi } from "vitest";

import {
  createOpenAIAlibabaSearchSource,
  isAlibabaProductUrl,
} from "../src/openai-alibaba-search-source.js";

const input = {
  productQuery: "patio misting system with pump 20 nozzles",
  queryVariants: [
    "patio misting system with pump 20 nozzles",
    "terrace misting system 20 nozzles pump kit",
  ],
  quantity: 100,
  targetCountry: "AT",
  language: "sr" as const,
};

function result(productUrl: string) {
  return {
    title: "Patio Misting System with Pump and 20 Nozzles",
    supplierName: "Ningbo Misting Factory",
    supplierCountry: "CN",
    price: 12,
    currency: "USD",
    minimumOrderQuantity: 10,
    incoterm: "FOB",
    productUrl,
    imageUrl: null,
    source: "Model supplied source",
  };
}

describe("OpenAI Alibaba fallback source", () => {
  it("accepts only direct HTTPS Alibaba product-detail URLs", () => {
    expect(isAlibabaProductUrl(
      "https://www.alibaba.com/product-detail/Patio-Misting-System_1600000000001.html",
    )).toBe(true);
    expect(isAlibabaProductUrl(
      "https://www.alibaba.com/trade/search?SearchText=misting",
    )).toBe(false);
    expect(isAlibabaProductUrl(
      "https://fakealibaba.com/product-detail/item_1600000000001.html",
    )).toBe(false);
    expect(isAlibabaProductUrl(
      "http://www.alibaba.com/product-detail/item_1600000000001.html",
    )).toBe(false);
  });

  it("uses Alibaba-specific site queries and rejects other cited marketplaces", async () => {
    const alibabaUrl = "https://www.alibaba.com/product-detail/Patio-Misting-System_1600000000001.html";
    const madeInChinaUrl = "https://example.en.made-in-china.com/product/example.html";
    let requestBody: Record<string, unknown> | null = null;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "resp_alibaba_fallback",
        status: "completed",
        output: [{
          type: "web_search_call",
          action: {
            type: "search",
            sources: [
              { type: "url", url: alibabaUrl },
              { type: "url", url: madeInChinaUrl },
            ],
          },
        }, {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              results: [result(alibabaUrl), result(madeInChinaUrl)],
            }),
            annotations: [
              { type: "url_citation", url: alibabaUrl },
              { type: "url_citation", url: madeInChinaUrl },
            ],
          }],
        }],
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const source = createOpenAIAlibabaSearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });

    const outcome = await source.search(input, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toEqual([
      expect.objectContaining({
        productUrl: alibabaUrl,
        source: "TAJA Alibaba",
      }),
    ]);
    expect(JSON.stringify(requestBody)).toContain("site:alibaba.com/product-detail");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
