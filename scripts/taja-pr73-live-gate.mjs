import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const LIVE_REQUEST = {
  productQuery: "patio misting system with pump 20 nozzles",
  queryVariants: [
    "patio misting system with pump 20 nozzles",
    "outdoor mist cooling kit pump 20 nozzles",
    "terrace misting system 20 nozzles pump kit",
    "patio misting cooling system",
  ],
  chinese1688QueryVariants: [
    "露台 喷雾降温系统 水泵 20个喷嘴 厂家 批发",
    "户外 喷雾套装 水泵 20喷头 厂家 批发",
  ],
  quantity: 100,
  targetCountry: "AT",
  language: "sr",
};

function parseEnv(contents) {
  return Object.fromEntries(contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
    }));
}

async function envFile(path) {
  return parseEnv(await readFile(resolve(path), "utf8"));
}

function sourceCounts(results) {
  return results.reduce((counts, result) => {
    const source = String(result?.source ?? "").toLowerCase();
    if (source.includes("1688")) counts.taja1688 += 1;
    else if (source.includes("alibaba")) counts.alibaba += 1;
    else if (source.includes("made-in-china")) counts.madeInChina += 1;
    else counts.otherWeb += 1;
    return counts;
  }, { taja1688: 0, alibaba: 0, madeInChina: 0, otherWeb: 0 });
}

const rootEnv = await envFile(".env");
const providerEnv = await envFile("services/importpilot-search-provider/.env");
const providerUrl = rootEnv.SUPPLIER_SEARCH_PROVIDER_URL;
const rootToken = rootEnv.SUPPLIER_SEARCH_PROVIDER_TOKEN;
const providerToken = providerEnv.SEARCH_PROVIDER_TOKEN;

if (!providerUrl) {
  console.error("PR73_LIVE_GATE CONFIG_ERROR: SUPPLIER_SEARCH_PROVIDER_URL is missing in .env");
  process.exit(2);
}
if (!rootToken || !providerToken || rootToken !== providerToken) {
  console.error("PR73_LIVE_GATE CONFIG_ERROR: app/provider search tokens are missing or do not match");
  process.exit(2);
}
if (!providerEnv.OPENAI_API_KEY) {
  console.error("PR73_LIVE_GATE CONFIG_ERROR: OPENAI_API_KEY is missing in search-provider .env");
  process.exit(2);
}

const body = JSON.stringify(LIVE_REQUEST);
const idempotencyKey = createHash("sha256")
  .update(`pr73-live-gate:${body}`)
  .digest("hex");
const startedAt = Date.now();
let response;

try {
  response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${rootToken}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
} catch (error) {
  console.error("PR73_LIVE_GATE NETWORK_ERROR", {
    durationMs: Date.now() - startedAt,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(3);
}

const payload = await response.json().catch(() => null);
const results = Array.isArray(payload?.results) ? payload.results : [];
const counts = sourceCounts(results);
const summaryCounts = payload?.summary?.sourceResultCounts ?? null;
const durationMs = Date.now() - startedAt;
const bounded = durationMs < 60_000;
const completed = response.status === 200 && results.length > 0;

const gate = {
  httpStatus: response.status,
  durationMs,
  bounded,
  totalResults: results.length,
  sourceCounts: counts,
  providerSourceResultCounts: summaryCounts,
  alibabaRecovered: counts.alibaba > 0,
  taja1688Recovered: counts.taja1688 > 0,
  madeInChinaRecovered: counts.madeInChina > 0,
  otherWebRecovered: counts.otherWeb > 0,
  reason: payload?.reason ?? null,
  disposition: completed && bounded ? "CORE_PASS" : "BLOCKED",
};

console.log("PR73_LIVE_GATE");
console.log(JSON.stringify(gate, null, 2));

if (!completed || !bounded) process.exitCode = 4;
