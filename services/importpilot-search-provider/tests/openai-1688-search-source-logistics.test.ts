import { describe, expect, it, vi } from "vitest";

import type { Supplier1688Enricher } from "../src/openai-1688-enrichment.js";
import {
  canonical1688UrlFromMirror,
  createOpenAI1688SearchSource,
  is1688MirrorProductUrl,
  is1688ProductUrl,
  mirror1688OfferId,
  prepare1688ResultsForEnrichment,
} from "../src/openai-1688-search-source.js";
import type { SupplierSearchResult } from "../src/contract.js";

const offerUrl = "https://detail.1688.com/offer/555555.html";

function incompleteResult(
  productUrl = offerUrl,
  overrides: Partial<SupplierSearchResult> = {},
): SupplierSearchResult {
  return {
    title: "Foldable organizer",
    supplierName: "1688 Factory",
    supplierCountry: null,
    price: 18.5,
    currency: "CNY",
    minimumOrderQuantity: 20,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "TAJA 1688",
    supplierLogistics: {
      grossWeightKg: null,
      netWeightKg: null,
      cartonLengthCm: null,
      cartonWidthCm: null,
      cartonHeightCm: null,
      piecesPerCarton: null,
      unitWeightKg: null,
      unitVolumeCbm: null,
      evidence: "SEARCH_SNIPPET",
    },
    ...overrides,
  };
}

function discoveryResponse(
  results: SupplierSearchResult[],
  citedUrls: string[],
  id = "resp_discovery_partial_logistics",
) {
  return {
    id,
    status: "completed",
    output: [{
      type: "web_search_call",
      action: {
        type: "search",
        sources: citedUrls.map((url) => ({ type: "url", url })),
      },
    }, {
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ results }),
        annotations: citedUrls.map((url) => ({ type: "url_citation", url })),
      }],
    }],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

describe("TAJA 1688 partial logistics handoff", () => {
  it("accepts only genuine HTTPS 1688 offer-detail URLs", () => {
    expect(is1688ProductUrl("https://detail.1688.com/offer/123456.html")).toBe(true);
    expect(is1688ProductUrl("https://m.1688.com/offer/123456.htm?spm=tracking")).toBe(true);
    expect(is1688ProductUrl("https://s.1688.com/selloffer/offer_search.htm?keywords=fan")).toBe(false);
    expect(is1688ProductUrl("https://www.1688.com/")).toBe(false);
    expect(is1688ProductUrl("http://detail.1688.com/offer/123456.html")).toBe(false);
    expect(is1688ProductUrl("https://fake1688.com/offer/123456.html")).toBe(false);
  });

  it("accepts only allowlisted mirror item URLs and derives the source offer mechanically", () => {
    const wholesale = "https://www.1688wholesale.com/zh-CHS/1688/china_alibaba_item/669806086431.html";
    const buy2you = "https://www.buy2you.com/en/1688wholesale/china_alibaba_item/672530970404.html";
    expect(is1688MirrorProductUrl(wholesale)).toBe(true);
    expect(is1688MirrorProductUrl(buy2you)).toBe(true);
    expect(mirror1688OfferId(wholesale)).toBe("669806086431");
    expect(canonical1688UrlFromMirror(wholesale)).toBe(
      "https://detail.1688.com/offer/669806086431.html",
    );
    expect(is1688MirrorProductUrl(
      "https://example.com/en/1688wholesale/china_alibaba_item/672530970404.html",
    )).toBe(false);
    expect(is1688MirrorProductUrl(
      "http://www.buy2you.com/en/1688wholesale/china_alibaba_item/672530970404.html",
    )).toBe(false);
  });

  it("uses a dedicated 1688-only primary prompt and logs rejected host/path diagnostics", async () => {
    const searchPage = "https://s.1688.com/selloffer/offer_search.htm?keywords=misting";
    const otherMarketplace = "https://www.alibaba.com/product-detail/misting-kit_123.html";
    const requestBodies: Record<string, unknown>[] = [];
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const payload = requestBodies.length === 1
        ? discoveryResponse([
            incompleteResult(searchPage),
            incompleteResult(otherMarketplace),
          ], [searchPage, otherMarketplace], "resp_direct_rejected")
        : discoveryResponse([], [], "resp_mirror_empty");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      logger: (event, details) => events.push({ event, details }),
      enricher: { implemented: false, async enrich() { throw new Error("not expected"); } },
    });

    const outcome = await source.search({
      productQuery: "patio misting system with pump 20 nozzles",
      queryVariants: ["patio misting system with pump 20 nozzles"],
      chinese1688QueryVariants: ["露台 喷雾降温系统 水泵 20个喷嘴"],
      quantity: 100,
      targetCountry: "AT",
      language: "sr",
    }, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(requestBodies[0])).toContain("dedicated 1688 sourcing researcher");
    expect(JSON.stringify(requestBodies[0])).toContain("/offer/<numeric-id>.htm");
    expect(JSON.stringify(requestBodies[1])).toContain("1688wholesale.com");
    expect(events).toContainEqual({
      event: "openai_web_search",
      details: expect.objectContaining({
        search_profile: "1688_only",
        parsed_results: 2,
        accepted_results: 0,
        rejected_results: 2,
        rejected_result_samples: expect.arrayContaining([
          {
            reason: "SOURCE_POLICY_REJECTED",
            url: "s.1688.com/selloffer/offer_search.htm",
          },
          {
            reason: "SOURCE_POLICY_REJECTED",
            url: "www.alibaba.com/product-detail/misting-kit_123.html",
          },
        ]),
      }),
    });
  });

  it("targets indexed detail and mobile offer hosts in the primary 1688 request", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(discoveryResponse(
        [incompleteResult()],
        [offerUrl],
        "resp_1688_query_targeting",
      )), { status: 200, headers: { "content-type": "application/json" } });
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      enricher: {
        implemented: false,
        async enrich() {
          throw new Error("Enrichment must not run when disabled.");
        },
      },
    });

    await source.search({
      productQuery: "patio misting system with pump 20 nozzles",
      queryVariants: ["patio misting system with pump 20 nozzles"],
      chinese1688QueryVariants: [
        "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
      ],
      quantity: 100,
      targetCountry: "AT",
      language: "sr",
    }, new AbortController().signal);

    const serialized = JSON.stringify(requestBody);
    expect(serialized).toContain("site:detail.1688.com inurl:offer");
    expect(serialized).toContain("site:m.1688.com inurl:offer");
    expect(serialized).toContain("dedicated 1688 sourcing researcher");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to an allowlisted indexed mirror, converts only the item identity, and discards mirror commercial data", async () => {
    const mirrorUrl = "https://www.1688wholesale.com/zh-CHS/1688/china_alibaba_item/669806086431.html";
    const directUrl = "https://detail.1688.com/offer/669806086431.html";
    const requestBodies: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const payload = requestBodies.length === 1
        ? discoveryResponse([], [], "resp_direct_empty")
        : discoveryResponse([
            incompleteResult(mirrorUrl, {
              title: "景观喷雾设备雾森系统高压喷雾主机",
              supplierName: "zk泽昆环保",
              supplierCountry: "CN",
              price: 1150.31,
              currency: "USD",
              minimumOrderQuantity: 1,
              source: "mirror",
            }),
          ], [mirrorUrl], "resp_mirror_hit");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      enricher: { implemented: false, async enrich() { throw new Error("not expected"); } },
    });

    const outcome = await source.search({
      productQuery: "outdoor high pressure misting system pump nozzles",
      chinese1688QueryVariants: ["户外 高压 喷雾 降温 系统 水泵 喷嘴"],
      quantity: 100,
      targetCountry: "AT",
      language: "sr",
    }, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(requestBodies[1])).toContain("site:1688wholesale.com");
    expect(outcome.results).toEqual([
      expect.objectContaining({
        title: "景观喷雾设备雾森系统高压喷雾主机",
        supplierName: "zk泽昆环保",
        productUrl: directUrl,
        source: "TAJA 1688 · indexed mirror",
        supplierCountry: null,
        price: null,
        currency: null,
        minimumOrderQuantity: null,
        incoterm: null,
        imageUrl: null,
      }),
    ]);
    expect(outcome.aiUsage).toHaveLength(2);
  });

  it("strips unusable partial logistics before enrichment", () => {
    expect(prepare1688ResultsForEnrichment([incompleteResult()])[0]?.supplierLogistics)
      .toBeUndefined();
  });

  it("allows verified logistics to replace a partial discovery object", async () => {
    const discovered = incompleteResult();
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify(discoveryResponse([discovered], [offerUrl])),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const enrich: Supplier1688Enricher["enrich"] = vi.fn(async ({ results }) => {
      expect(results[0]?.supplierLogistics).toBeUndefined();
      return {
        enrichedCount: 1,
        results: results.map((result: SupplierSearchResult) => ({
          ...result,
          supplierLogistics: {
            grossWeightKg: 12,
            netWeightKg: null,
            cartonLengthCm: 60,
            cartonWidthCm: 40,
            cartonHeightCm: 35,
            piecesPerCarton: 20,
            unitWeightKg: null,
            unitVolumeCbm: null,
            evidence: "PRODUCT_PAGE" as const,
          },
        })),
      };
    });
    const source = createOpenAI1688SearchSource({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      enricher: { implemented: true, enrich },
    });

    const outcome = await source.search({
      productQuery: "foldable organizer",
      quantity: 100,
      targetCountry: "AT",
      language: "en",
    }, new AbortController().signal);
    if (Array.isArray(outcome)) throw new Error("Expected structured outcome.");

    expect(outcome.results[0]?.supplierLogistics).toMatchObject({
      grossWeightKg: 12,
      piecesPerCarton: 20,
      evidence: "PRODUCT_PAGE",
    });
  });
});
