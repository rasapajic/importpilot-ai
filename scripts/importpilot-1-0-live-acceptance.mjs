import { createHash, randomUUID } from "node:crypto";

const searchToken = process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN?.trim();
const searchBase = process.env.SUPPLIER_SEARCH_PROVIDER_BASE_URL?.trim();
const explicitSearchUrl = process.env.SUPPLIER_SEARCH_PROVIDER_URL?.trim();
const urlImportEndpoint = process.env.URL_IMPORT_PROVIDER_URL?.trim();
const urlImportToken = process.env.URL_IMPORT_PROVIDER_TOKEN?.trim();
const acceptanceProductUrl = process.env.IMPORTPILOT_ACCEPTANCE_PRODUCT_URL?.trim();

const requestTimeoutMs = 60_000;

function requireValue(value, name) {
  if (!value) {
    console.error(`IMPORTPILOT_1_0_LIVE_ACCEPTANCE CONFIG_ERROR: ${name} is missing.`);
    process.exit(2);
  }
  return value;
}

function searchEndpoints() {
  if (explicitSearchUrl) {
    const search = new URL(explicitSearchUrl);
    const health = new URL(search);
    health.pathname = health.pathname.replace(/\/search\/?$/, "/health");
    if (!health.pathname.endsWith("/health")) health.pathname = "/health";
    health.search = "";
    return { search, health };
  }

  const base = new URL(requireValue(searchBase, "SUPPLIER_SEARCH_PROVIDER_BASE_URL or SUPPLIER_SEARCH_PROVIDER_URL"));
  const search = new URL(base);
  search.pathname = `${search.pathname.replace(/\/$/, "")}/search`.replace(/\/+/g, "/");
  const health = new URL(base);
  health.pathname = `${health.pathname.replace(/\/$/, "")}/health`.replace(/\/+/g, "/");
  return { search, health };
}

async function fetchJson(url, options = {}, timeoutMs = requestTimeoutMs) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body, durationMs: Date.now() - startedAt };
}

function resultContractProblems(result) {
  const problems = [];
  if (!result || typeof result !== "object") return ["result is not an object"];
  for (const key of ["title", "supplierName", "productUrl", "source"]) {
    if (typeof result[key] !== "string" || !result[key].trim()) problems.push(`${key} missing`);
  }
  const priceMissing = result.price === null || result.price === undefined;
  const currencyMissing = result.currency === null || result.currency === undefined;
  if (priceMissing !== currencyMissing) problems.push("price/currency pairing inconsistent");
  return problems;
}

const searchCases = [
  {
    id: "electronics-at",
    productQuery: "USB-C to USB-C braided charging cable 100W 1 m",
    quantity: 100,
    targetCountry: "AT",
    language: "de",
  },
  {
    id: "packaging-de",
    productQuery: "kraft paper takeaway food boxes 1000 ml",
    quantity: 500,
    targetCountry: "DE",
    language: "en",
  },
  {
    id: "household-rs",
    productQuery: "stainless steel vacuum bottle 500 ml",
    quantity: 300,
    targetCountry: "RS",
    language: "sr",
  },
];

async function main() {
  const token = requireValue(searchToken, "SUPPLIER_SEARCH_PROVIDER_TOKEN");
  const importEndpoint = requireValue(urlImportEndpoint, "URL_IMPORT_PROVIDER_URL");
  const importToken = requireValue(urlImportToken, "URL_IMPORT_PROVIDER_TOKEN");
  const productUrl = requireValue(acceptanceProductUrl, "IMPORTPILOT_ACCEPTANCE_PRODUCT_URL");
  const endpoints = searchEndpoints();
  const report = {
    startedAt: new Date().toISOString(),
    supplierHealth: null,
    searches: [],
    urlImport: null,
    disposition: "BLOCKED",
  };

  const authHeaders = { authorization: `Bearer ${token}` };
  const health = await fetchJson(endpoints.health, { headers: authHeaders }, 20_000);
  report.supplierHealth = {
    httpStatus: health.response.status,
    durationMs: health.durationMs,
    body: health.body,
  };
  if (health.response.status !== 200) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  for (const testCase of searchCases) {
    const body = JSON.stringify({
      productQuery: testCase.productQuery,
      quantity: testCase.quantity,
      targetCountry: testCase.targetCountry,
      language: testCase.language,
    });
    const idempotencyKey = createHash("sha256")
      .update(`importpilot-1.0-final:${testCase.id}:${body}`)
      .digest("hex");
    const outcome = await fetchJson(endpoints.search, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body,
    });
    const results = Array.isArray(outcome.body?.results) ? outcome.body.results : [];
    const contractProblems = results.flatMap((result, index) =>
      resultContractProblems(result).map((problem) => `result ${index + 1}: ${problem}`),
    );
    report.searches.push({
      ...testCase,
      httpStatus: outcome.response.status,
      durationMs: outcome.durationMs,
      resultCount: results.length,
      sources: [...new Set(results.map((item) => item?.source).filter(Boolean))],
      summary: outcome.body?.summary ?? null,
      reason: outcome.body?.reason ?? null,
      contractProblems,
    });
  }

  const importOutcome = await fetchJson(importEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${importToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ productUrl }),
  });
  const payload = importOutcome.body;
  const candidate = payload && typeof payload === "object" && "preview" in payload
    ? payload.preview
    : payload;
  const preview = candidate && typeof candidate === "object" ? candidate : null;
  const verifiedFields = preview
    ? [
        preview.title ?? preview.productTitle,
        preview.supplierName,
        preview.price,
        preview.currency,
        preview.minimumOrderQuantity,
        preview.imageUrl,
      ].filter((value) => value !== null && value !== undefined && value !== "").length
    : 0;
  report.urlImport = {
    httpStatus: importOutcome.response.status,
    durationMs: importOutcome.durationMs,
    productUrl,
    reason: payload && typeof payload === "object" ? payload.reason ?? null : null,
    verifiedFieldCount: verifiedFields,
    preview: preview
      ? {
          title: preview.title ?? preview.productTitle ?? null,
          supplierName: preview.supplierName ?? null,
          price: preview.price ?? null,
          currency: preview.currency ?? null,
          minimumOrderQuantity: preview.minimumOrderQuantity ?? null,
          imageUrl: preview.imageUrl ?? null,
          incoterm: preview.incoterm ?? null,
        }
      : null,
  };

  const searchPass = report.searches.every((item) =>
    item.httpStatus === 200 && item.resultCount > 0 && item.contractProblems.length === 0 && item.durationMs < requestTimeoutMs,
  );
  const urlImportPass = importOutcome.response.ok && verifiedFields > 0;
  report.disposition = searchPass && urlImportPass ? "CORE_PROVIDER_PASS" : "BLOCKED";
  report.completedAt = new Date().toISOString();
  report.runId = randomUUID();

  console.log("IMPORTPILOT_1_0_LIVE_ACCEPTANCE");
  console.log(JSON.stringify(report, null, 2));

  if (report.disposition !== "CORE_PROVIDER_PASS") process.exitCode = 4;
}

main().catch((error) => {
  console.error("IMPORTPILOT_1_0_LIVE_ACCEPTANCE ERROR");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(5);
});
