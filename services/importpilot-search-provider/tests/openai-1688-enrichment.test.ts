import { describe, expect, it, vi } from "vitest";

import { createOpenAI1688Enricher } from "../src/openai-1688-enrichment.js";
import type { SupplierSearchResult } from "../src/contract.js";

function result(
  productUrl: string,
  overrides: Partial<SupplierSearchResult> = {},
): SupplierSearchResult {
  return {
    title: "Foldable organizer",
    supplierName: "1688 Factory",
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "TAJA 1688",
    ...overrides,
  };
}

function openAiResponse(input: {
  enrichments: unknown[];
  citedUrls: string[];
}) {
  return {
    id: "resp_1688_enrichment",
    status: "completed",
    output: [{
      type: "web_search_call",
      action: {
        type: "search",
        sources: input.citedUrls.map((url) => ({ type: "url", url })),
      },
    }, {
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ enrichments: input.enrichments }),
        annotations: input.citedUrls.map((url) => ({ type: "url_citation", url })),
      }],
    }],
    usage: {
      input_tokens: 200,
      output_tokens: 100,
      total_tokens: 300,
    },
  };
}

describe("OpenAI 1688 batch enrichment", () => {
  it("enriches exact cited URLs in one bounded request and preserves known values", async () => {
    const firstUrl = "https://detail.1688.com/offer/111111.html";
    const secondUrl = "https://detail.1688.com/offer/222222.html";
    let requestBody = "";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify(openAiResponse({
        citedUrls: [firstUrl, secondUrl],
        enrichments: [{
          productUrl: firstUrl,
          supplierCountry: "CN",
          price: 18.5,
          currency: "CNY",
          minimumOrderQuantity: 20,
          incoterm: null,
          imageUrl: "https://cbu01.alicdn.com/img/first.jpg",
          supplierLogistics: {
            grossWeightKg: 12,
            netWeightKg: null,
            cartonLengthCm: 60,
            cartonWidthCm: 40,
            cartonHeightCm: 35,
            piecesPerCarton: 20,
            unitWeightKg: null,
            unitVolumeCbm: null,
            evidence: "PRODUCT_PAGE",
          },
        }, {
          productUrl: secondUrl,
          supplierCountry: "CN",
          price: 1,
          currency: "CNY",
          minimumOrderQuantity: 1,
          incoterm: null,
          imageUrl: null,
          supplierLogistics: {
            grossWeightKg: null,
            netWeightKg: null,
            cartonLengthCm: null,
            cartonWidthCm: null,
            cartonHeightCm: null,
            piecesPerCarton: null,
            unitWeightKg: 0.7,
            unitVolumeCbm: 0.004,
            evidence: "SEARCH_SNIPPET",
          },
        }],
      })), { status: 200, headers: { "content-type": "application/json" } });
    });
    const enricher = createOpenAI1688Enricher({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
      now: () => 1_000,
    });

    const outcome = await enricher.enrich({
      quantity: 100,
      results: [
        result(firstUrl),
        result(secondUrl, {
          price: 25,
          currency: "EUR",
          minimumOrderQuantity: 250,
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
        }),
      ],
    }, new AbortController().signal);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestBody).toContain(firstUrl);
    expect(requestBody).toContain(secondUrl);
    expect(requestBody).toContain("Requested purchase quantity: 100");
    expect(outcome.enrichedCount).toBe(2);
    expect(outcome.results[0]).toMatchObject({
      supplierCountry: "CN",
      price: 18.5,
      currency: "CNY",
      minimumOrderQuantity: 20,
      imageUrl: "https://cbu01.alicdn.com/img/first.jpg",
      supplierLogistics: {
        grossWeightKg: 12,
        piecesPerCarton: 20,
        evidence: "PRODUCT_PAGE",
      },
    });
    expect(outcome.results[1]).toMatchObject({
      supplierCountry: "CN",
      price: 25,
      currency: "EUR",
      minimumOrderQuantity: 250,
      supplierLogistics: {
        unitWeightKg: 0.7,
        unitVolumeCbm: 0.004,
        evidence: "SEARCH_SNIPPET",
      },
    });
    expect(outcome.aiUsage).toEqual([
      expect.objectContaining({ operation: "supplier_enrichment" }),
    ]);
  });

  it("discards uncited or substituted offer data", async () => {
    const requestedUrl = "https://detail.1688.com/offer/333333.html";
    const substitutedUrl = "https://detail.1688.com/offer/999999.html";
    const fetcher = vi.fn(async () => new Response(JSON.stringify(openAiResponse({
      citedUrls: [substitutedUrl],
      enrichments: [{
        productUrl: substitutedUrl,
        supplierCountry: "CN",
        price: 2,
        currency: "CNY",
        minimumOrderQuantity: 1,
        incoterm: null,
        imageUrl: null,
        supplierLogistics: null,
      }],
    })), { status: 200, headers: { "content-type": "application/json" } }));
    const enricher = createOpenAI1688Enricher({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });
    const original = result(requestedUrl);

    const outcome = await enricher.enrich({
      quantity: 100,
      results: [original],
    }, new AbortController().signal);

    expect(outcome.enrichedCount).toBe(0);
    expect(outcome.results).toEqual([original]);
  });
  it("keeps valid candidates when another batch record is invalid", async () => {
    const validUrl = "https://detail.1688.com/offer/444444.html";
    const invalidUrl = "https://detail.1688.com/offer/555555.html";
    const fetcher = vi.fn(async () => new Response(JSON.stringify(openAiResponse({
      citedUrls: [validUrl, invalidUrl],
      enrichments: [{
        productUrl: validUrl,
        supplierCountry: "CN",
        price: 19,
        currency: "CNY",
        minimumOrderQuantity: 10,
        incoterm: null,
        imageUrl: null,
        supplierLogistics: null,
      }, {
        productUrl: invalidUrl,
        supplierCountry: "CN",
        price: 1,
        currency: "CNY",
        minimumOrderQuantity: 1,
        incoterm: null,
        imageUrl: null,
        supplierLogistics: {
          grossWeightKg: -5,
          netWeightKg: null,
          cartonLengthCm: 40,
          cartonWidthCm: 30,
          cartonHeightCm: 20,
          piecesPerCarton: 10,
          unitWeightKg: null,
          unitVolumeCbm: null,
          evidence: "PRODUCT_PAGE",
        },
      }],
    })), { status: 200, headers: { "content-type": "application/json" } }));
    const enricher = createOpenAI1688Enricher({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });

    const outcome = await enricher.enrich({
      quantity: 100,
      results: [result(validUrl), result(invalidUrl)],
    }, new AbortController().signal);

    expect(outcome.enrichedCount).toBe(1);
    expect(outcome.results[0]).toMatchObject({
      price: 19,
      currency: "CNY",
      minimumOrderQuantity: 10,
    });
    expect(outcome.results[1]).toEqual(result(invalidUrl));
  });

  it("does not call enrichment for a 1688 search page", async () => {
    const fetcher = vi.fn();
    const enricher = createOpenAI1688Enricher({
      apiKey: "sk-test",
      fetcher: fetcher as typeof fetch,
    });
    const searchUrl = "https://s.1688.com/selloffer/offer_search.htm?keywords=organizer";

    const outcome = await enricher.enrich({
      quantity: 100,
      results: [result(searchUrl)],
    }, new AbortController().signal);

    expect(fetcher).not.toHaveBeenCalled();
    expect(outcome).toEqual({ results: [result(searchUrl)], enrichedCount: 0 });
  });

});
