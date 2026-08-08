import { describe, expect, it, vi } from "vitest";

import { searchRequestSchema } from "../src/contract.js";
import { createOpenAI1688SearchSource } from "../src/openai-1688-search-source.js";
import { createOpenAIWebSearchSource } from "../src/openai-web-search-source.js";

function emptyOpenAiResponse() {
  return {
    id: "resp_query_variants",
    status: "completed",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ results: [] }),
        annotations: [],
      }],
    }],
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  };
}

describe("requirement-driven supplier query variants", () => {
  it("normalizes bounded variants while keeping legacy requests valid", () => {
    expect(searchRequestSchema.parse({
      query: "patio misting system with pump 20 nozzles",
      queryVariants: [
        "patio misting system with pump 20 nozzles",
        "outdoor mist cooling kit pump 20 nozzles",
        "outdoor mist cooling kit pump 20 nozzles",
      ],
      chinese1688QueryVariants: [
        "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
      ],
      quantity: 100,
      targetCountry: "AT",
      language: "sr",
    })).toMatchObject({
      productQuery: "patio misting system with pump 20 nozzles",
      queryVariants: [
        "patio misting system with pump 20 nozzles",
        "outdoor mist cooling kit pump 20 nozzles",
      ],
      chinese1688QueryVariants: [
        "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
      ],
    });

    expect(searchRequestSchema.parse({
      productQuery: "phone charger",
      quantity: 100,
      targetCountry: "DE",
    })).toMatchObject({
      productQuery: "phone charger",
      queryVariants: ["phone charger"],
      chinese1688QueryVariants: [],
    });
  });

  it("sends every precise English variant in one OpenAI research pass", async () => {
    let requestBody = "";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify(emptyOpenAiResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const source = createOpenAIWebSearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });

    await source.search({
      productQuery: "patio misting system with pump 20 nozzles",
      queryVariants: [
        "patio misting system with pump 20 nozzles",
        "outdoor mist cooling kit pump 20 nozzles",
        "terrace misting system 20 nozzles pump kit",
      ],
      quantity: 100,
      targetCountry: "AT",
      language: "en",
    }, new AbortController().signal);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestBody).toContain("patio misting system with pump 20 nozzles");
    expect(requestBody).toContain("outdoor mist cooling kit pump 20 nozzles");
    expect(requestBody).toContain("terrace misting system 20 nozzles pump kit");
    expect(requestBody).toContain("Do not stop merely because the first query returned generic related products");
  });

  it("uses the supplied Chinese variants for the dedicated 1688 pass", async () => {
    let requestBody = "";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify(emptyOpenAiResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });

    await source.search({
      productQuery: "patio misting system with pump 20 nozzles",
      queryVariants: ["patio misting system with pump 20 nozzles"],
      chinese1688QueryVariants: [
        "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
        "户外 喷雾套装 水泵 20喷头 厂家 批发",
      ],
      quantity: 100,
      targetCountry: "AT",
      language: "en",
    }, new AbortController().signal);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestBody).toContain("露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发 site:detail.1688.com inurl:offer");
    expect(requestBody).toContain("户外 喷雾套装 水泵 20喷头 厂家 批发 site:detail.1688.com inurl:offer");
    expect(requestBody).toContain("露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发 site:1688.com");
    expect(requestBody).toContain("Do not discard a verified direct offer");
    expect(requestBody).toContain("Supplier not confirmed");
  });
});
