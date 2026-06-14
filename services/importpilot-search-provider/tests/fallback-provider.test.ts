import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createAlibabaSupplierSearchSource } from "../src/alibaba-source.js";
import { createMadeInChinaSupplierSearchSource } from "../src/made-in-china-provider.js";
import {
  createFallbackSupplierSearchSource,
  FALLBACK_UNAVAILABLE_REASON,
  type SupplierSearchSource,
} from "../src/provider.js";

const fixturePath = fileURLToPath(new URL("./fixtures/made-in-china-search.html", import.meta.url));
const input = { productQuery: "PTZ camera", quantity: 100, targetCountry: "RS", language: "sr" as const };

describe("supplier provider fallback chain", () => {
  it("falls back to Made-in-China when Alibaba is blocked", async () => {
    const fixture = await readFile(fixturePath, "utf8");
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createFallbackSupplierSearchSource([
      createAlibabaSupplierSearchSource({
        fetcher: async () => new Response("CAPTCHA verify you are human", { status: 200 }),
      }),
      createMadeInChinaSupplierSearchSource({
        fetcher: async () => new Response(fixture),
      }),
    ], (event, details) => events.push({ event, details }));

    const outcome = await source.search(input, new AbortController().signal);
    expect(Array.isArray(outcome)).toBe(false);
    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(2);
    expect(Array.isArray(outcome) ? outcome[0] : outcome.results[0])
      .toMatchObject({ source: "Made-in-China" });
    expect(events).toContainEqual({
      event: "provider_attempt",
      details: { provider_name: "made-in-china-v1", parsed_results: 2, fallback_used: true },
    });
    expect(events).toContainEqual({
      event: "provider_final_result",
      details: {
        final_provider_used: "made-in-china-v1",
        final_result_count: 2,
        final_reason: null,
      },
    });
  });

  it("returns empty results when all providers fail", async () => {
    const failing = (name: string, reason: string): SupplierSearchSource => ({
      name,
      implemented: true,
      async search() {
        return { results: [], reason };
      },
    });
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createFallbackSupplierSearchSource([
      failing("alibaba-v1", "Alibaba blocked or rejected the search request."),
      failing("made-in-china-v1", "Made-in-China blocked or rejected the search request."),
    ], (event, details) => events.push({ event, details }));

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: FALLBACK_UNAVAILABLE_REASON,
    });
    expect(events).toContainEqual({
      event: "provider_final_result",
      details: {
        final_provider_used: null,
        final_result_count: 0,
        final_reason: FALLBACK_UNAVAILABLE_REASON,
      },
    });
  });
});
