import { createServer } from "node:http";

import { DEFAULT_OPENAI_PRICING } from "./ai-cost.js";
import { createSearchProviderApp } from "./app.js";
import { createAlibabaSupplierSearchSource } from "./alibaba-source.js";
import { createDevelopmentLogger } from "./development-log.js";
import { createMadeInChinaSupplierSearchSource } from "./made-in-china-provider.js";
import {
  openAIReasoningEffort,
  openAISearchContextSize,
} from "./openai-search-config.js";
import { createOpenAIWebSearchSource } from "./openai-web-search-source.js";
import { createFallbackSupplierSearchSource } from "./provider.js";

function nonnegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
const source = createFallbackSupplierSearchSource([
  createOpenAIWebSearchSource({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_SEARCH_MODEL ?? "gpt-5-mini",
    maxResults: Number(process.env.OPENAI_SEARCH_MAX_RESULTS ?? 3),
    requestTimeoutMs: Number(process.env.OPENAI_SEARCH_TIMEOUT_MS ?? 45_000),
    searchContextSize: openAISearchContextSize(process.env.OPENAI_SEARCH_CONTEXT_SIZE),
    reasoningEffort: openAIReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
    pricing: openAiPricing,
    logger,
  }),
  createAlibabaSupplierSearchSource({
    userAgent: process.env.ALIBABA_USER_AGENT,
    requestTimeoutMs: Number(process.env.ALIBABA_TIMEOUT_MS ?? 4_000),
    logger,
  }),
  createMadeInChinaSupplierSearchSource({
    userAgent: process.env.MADE_IN_CHINA_USER_AGENT,
    debugHtml: process.env.SEARCH_PROVIDER_DEBUG_HTML === "true",
    requestTimeoutMs: Number(process.env.MADE_IN_CHINA_TIMEOUT_MS ?? 5_000),
    logger,
  }),
], logger);

const server = createServer(createSearchProviderApp({
  token,
  source,
  logger,
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 90_000),
  rateLimitMax: Number(process.env.SEARCH_RATE_LIMIT_MAX ?? 30),
  rateLimitWindowMs: Number(process.env.SEARCH_RATE_LIMIT_WINDOW_MS ?? 60_000),
}));

server.listen(port, () => {
  logger("server_listening", { url: `http://localhost:${port}` });
});
