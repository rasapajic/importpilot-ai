import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function exportedNumber(file: string, name: string) {
  const match = file.match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match?.[1]) throw new Error(`Missing numeric constant ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

const serverSource = source("services/importpilot-search-provider/src/server.ts");
const providerSource = source("modules/product-search/infrastructure/provider.ts");
const routeSource = source("app/api/projects/[projectId]/supplier-search/route.ts");
const finalistSource = source("modules/product-search/infrastructure/finalist-url-enrichment-provider.ts");

describe("supplier-search end-to-end deadline contract", () => {
  it("finishes paid provider work before app and browser deadlines", () => {
    const service = exportedNumber(serverSource, "SEARCH_SERVICE_HARD_TIMEOUT_MS");
    const appProvider = exportedNumber(
      providerSource,
      "SUPPLIER_SEARCH_APP_PROVIDER_HARD_TIMEOUT_MS",
    );
    const route = exportedNumber(routeSource, "SUPPLIER_SEARCH_REQUEST_TIMEOUT_MS");
    const finalist = exportedNumber(finalistSource, "TAJA_FINALIST_EXACT_PAGE_TIMEOUT_MS");

    expect(service).toBe(50_000);
    expect(appProvider).toBe(55_000);
    expect(route).toBe(60_000);
    expect(service).toBeLessThan(appProvider);
    expect(appProvider + finalist).toBeLessThan(route);
    expect(providerSource).toContain("boundedProviderTimeout");
  });

  it("keeps every configured source path inside the service deadline", () => {
    const service = exportedNumber(serverSource, "SEARCH_SERVICE_HARD_TIMEOUT_MS");
    const openAi = exportedNumber(serverSource, "OPENAI_SEARCH_HARD_TIMEOUT_MS");
    const enrichment = exportedNumber(
      serverSource,
      "OPENAI_1688_ENRICH_HARD_TIMEOUT_MS",
    );
    const alibabaDirect = exportedNumber(
      serverSource,
      "ALIBABA_DIRECT_HARD_TIMEOUT_MS",
    );
    const madeInChina = exportedNumber(
      serverSource,
      "MADE_IN_CHINA_HARD_TIMEOUT_MS",
    );

    expect(openAi).toBeLessThan(service);
    expect(openAi + enrichment).toBeLessThan(service);
    expect(openAi + 5 * alibabaDirect).toBeLessThan(service);
    expect(5 * madeInChina).toBeLessThan(service);
    expect(serverSource).toContain("MAX_QUERY_VARIANTS_PER_DIRECT_SOURCE = 5");
    expect(serverSource).toContain("boundedTimeout(");
  });
});