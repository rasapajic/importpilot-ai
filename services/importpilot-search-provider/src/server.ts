import { createServer } from "node:http";

import { DEFAULT_OPENAI_PRICING } from "./ai-cost.js";
import { createSearchProviderApp } from "./app.js";
import { createAlibabaSupplierSearchSource } from "./alibaba-source.js";
import { createDevelopmentLogger } from "./development-log.js";
import { createMadeInChinaSupplierSearchSource } from "./made-in-china-provider.js";
import { createOpenAI1688SearchSource } from "./openai-1688-search-source.js";
import { createOpenAIAlibabaSearchSource } from "./openai-alibaba-search-source.js";
import {
  openAIReasoningEffort,
  openAISearchContextSize,
} from "./openai-search-config.js";
import { createOpenAIWebSearchSource } from "./openai-web-search-source.js";
import {
  createAggregatingSupplierSearchSource,
  createFallbackSupplierSearchSource,
} from "./provider.js";
import { createQueryVariantExpandingSource } from "./query-variant-source.js";

export const SEARCH_SERVICE_HARD_TIMEOUT_MS = 50_000;
export const OPENAI_SEARCH_HARD_TIMEOUT_MS = 30_000;
export const OPENAI_1688_ENRICH_HARD_TIMEOUT_MS = 8_000;
export const ALIBABA_DIRECT_HARD_TIMEOUT_MS = 3_000;
export const MADE_IN_CHINA_HARD_TIMEOUT_MS = 4_000;
const MAX_QUERY_VARIANTS_PER_DIRECT_SOURCE = 5;

function nonnegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

function boundedTimeout(
  value: string | undefined,
  fallback: number,
  hardMaximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1_000, Math.min(hardMaximum, Math.trunc(parsed)));
}

const port = Number(process.env.PORT ?? 4000);
const token = process.env.SEARCH_PROVIDER_TOKEN ?? "";
const logger = createDevelopmentLogger();
const openAiPricing = {
  version: process.env.OPENAI_PRICING_VERSION ?? DEFAULT_OPENAI_PRICING.version,
  inputPricePerMillionUsd: nonnegativeNumber(
    process.env.OPENAI_INPUT_PRICE_PER_MILLION_USD,
    DEFAULT_OPENAI_PRICING.inputPricePerMillionUsd,
  ),
  cachedInputPricePerMillionUsd: nonnegativeNumber(
    process.env.OPENAI_CACHED_INPUT_PRICE_PER_MILLION_USD,
    DEFAULT_OPENAI_PRICING.cachedInputPricePerMillionUsd,
  ),
  outputPricePerMillionUsd: nonnegativeNumber(
    process.env.OPENAI_OUTPUT_PRICE_PER_MILLION_USD,
    DEFAULT_OPENAI_PRICING.outputPricePerMillionUsd,
  ),
  webSearchPricePerCallUsd: nonnegativeNumber(
    process.env.OPENAI_WEB_SEARCH_PRICE_PER_CALL_USD,
    DEFAULT_OPENAI_PRICING.webSearchPricePerCallUsd,
  ),
};
const openAiSourceOptions = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini",
  requestTimeoutMs: boundedTimeout(
    process.env.OPENAI_SEARCH_TIMEOUT_MS,
    OPENAI_SEARCH_HARD_TIMEOUT_MS,
    OPENAI_SEARCH_HARD_TIMEOUT_MS,
  ),
  searchContextSize: openAISearchContextSize(process.env.OPENAI_SEARCH_CONTEXT_SIZE),
  reasoningEffort: openAIReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
  pricing: openAiPricing,
  logger,
};
const alibabaDirectAdapter = createAlibabaSupplierSearchSource({
  userAgent: process.env.ALIBABA_USER_AGENT,
  requestTimeoutMs: boundedTimeout(
    process.env.ALIBABA_TIMEOUT_MS,
    ALIBABA_DIRECT_HARD_TIMEOUT_MS,
    ALIBABA_DIRECT_HARD_TIMEOUT_MS,
  ),
  logger,
});
const madeInChinaSource = createMadeInChinaSupplierSearchSource({
  userAgent: process.env.MADE_IN_CHINA_USER_AGENT,
  debugHtml: process.env.SEARCH_PROVIDER_DEBUG_HTML === "true",
  requestTimeoutMs: boundedTimeout(
    process.env.MADE_IN_CHINA_TIMEOUT_MS,
    MADE_IN_CHINA_HARD_TIMEOUT_MS,
    MADE_IN_CHINA_HARD_TIMEOUT_MS,
  ),
  logger,
});
const alibabaSource = createFallbackSupplierSearchSource([
  createQueryVariantExpandingSource(alibabaDirectAdapter, {
    maxVariants: boundedPositiveInteger(
      process.env.ALIBABA_QUERY_VARIANT_LIMIT,
      5,
      MAX_QUERY_VARIANTS_PER_DIRECT_SOURCE,
    ),
    maxResults: Number(process.env.TAJA_DEEP_SEARCH_MAX_PER_SOURCE ?? 15),
    logger,
  }),
  createOpenAIAlibabaSearchSource({
    ...openAiSourceOptions,
    maxResults: Number(process.env.OPENAI_ALIBABA_MAX_RESULTS ?? 5),
  }),
], logger);
const source = createAggregatingSupplierSearchSource([
  createOpenAIWebSearchSource({
    ...openAiSourceOptions,
    maxResults: Number(process.env.OPENAI_SEARCH_MAX_RESULTS ?? 10),
  }),
  createOpenAI1688SearchSource({
    ...openAiSourceOptions,
    maxResults: Number(process.env.OPENAI_1688_MAX_RESULTS ?? 10),
    enrichmentMaxResults: Number(process.env.OPENAI_1688_ENRICH_MAX_RESULTS ?? 5),
    enrichmentTimeoutMs: boundedTimeout(
      process.env.OPENAI_1688_ENRICH_TIMEOUT_MS,
      OPENAI_1688_ENRICH_HARD_TIMEOUT_MS,
      OPENAI_1688_ENRICH_HARD_TIMEOUT_MS,
    ),
  }),
  alibabaSource,
  createQueryVariantExpandingSource(madeInChinaSource, {
    maxVariants: boundedPositiveInteger(
      process.env.MADE_IN_CHINA_QUERY_VARIANT_LIMIT,
      5,
      MAX_QUERY_VARIANTS_PER_DIRECT_SOURCE,
    ),
    maxResults: Number(process.env.TAJA_DEEP_SEARCH_MAX_PER_SOURCE ?? 15),
    logger,
  }),
], {
  maxResults: Number(process.env.TAJA_DEEP_SEARCH_MAX_RESULTS ?? 30),
  maxResultsPerSource: Number(process.env.TAJA_DEEP_SEARCH_MAX_PER_SOURCE ?? 15),
}, logger);

const server = createServer(createSearchProviderApp({
  token,
  source,
  logger,
  timeoutMs: boundedTimeout(
    process.env.UPSTREAM_TIMEOUT_MS,
    SEARCH_SERVICE_HARD_TIMEOUT_MS,
    SEARCH_SERVICE_HARD_TIMEOUT_MS,
  ),
  rateLimitMax: Number(process.env.SEARCH_RATE_LIMIT_MAX ?? 30),
  rateLimitWindowMs: Number(process.env.SEARCH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  idempotencyTtlMs: Number(process.env.SEARCH_IDEMPOTENCY_TTL_MS ?? 120_000),
}));

server.listen(port, () => {
  logger("server_listening", { url: `http://localhost:${port}` });
});
