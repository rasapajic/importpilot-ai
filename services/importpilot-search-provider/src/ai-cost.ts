import type { AiUsageReport } from "./contract.js";

export type OpenAiPricingSnapshot = {
  version: string;
  inputPricePerMillionUsd: number;
  cachedInputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
  webSearchPricePerCallUsd: number;
};

export const DEFAULT_OPENAI_PRICING: OpenAiPricingSnapshot = {
  version: "openai-standard-2026-08-06",
  inputPricePerMillionUsd: 0.25,
  cachedInputPricePerMillionUsd: 0.025,
  outputPricePerMillionUsd: 2,
  webSearchPricePerCallUsd: 0.01,
};

type UsageInput = {
  model: string;
  responseId: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  totalTokens: number;
  webSearchCalls: number;
  durationMs: number;
  pricing?: OpenAiPricingSnapshot;
};

function nonnegativeInteger(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

function money(value: number) {
  return Number(Math.max(0, value).toFixed(12));
}

export function createOpenAiUsageReport({
  model,
  responseId,
  inputTokens,
  cachedInputTokens = 0,
  outputTokens,
  reasoningOutputTokens = 0,
  totalTokens,
  webSearchCalls,
  durationMs,
  pricing = DEFAULT_OPENAI_PRICING,
}: UsageInput): AiUsageReport {
  const safeInputTokens = nonnegativeInteger(inputTokens);
  const safeCachedInputTokens = Math.min(
    safeInputTokens,
    nonnegativeInteger(cachedInputTokens),
  );
  const billableUncachedInputTokens = safeInputTokens - safeCachedInputTokens;
  const safeOutputTokens = nonnegativeInteger(outputTokens);
  const safeReasoningOutputTokens = Math.min(
    safeOutputTokens,
    nonnegativeInteger(reasoningOutputTokens),
  );
  const safeTotalTokens = Math.max(
    safeInputTokens + safeOutputTokens,
    nonnegativeInteger(totalTokens),
  );
  const safeWebSearchCalls = nonnegativeInteger(webSearchCalls);

  const inputCostUsd = money(
    (billableUncachedInputTokens / 1_000_000) * pricing.inputPricePerMillionUsd,
  );
  const cachedInputCostUsd = money(
    (safeCachedInputTokens / 1_000_000) * pricing.cachedInputPricePerMillionUsd,
  );
  const outputCostUsd = money(
    (safeOutputTokens / 1_000_000) * pricing.outputPricePerMillionUsd,
  );
  const webSearchCostUsd = money(
    safeWebSearchCalls * pricing.webSearchPricePerCallUsd,
  );
  const estimatedTotalCostUsd = money(
    inputCostUsd + cachedInputCostUsd + outputCostUsd + webSearchCostUsd,
  );

  return {
    provider: "openai",
    operation: "supplier_search",
    model,
    responseId,
    status: "completed",
    inputTokens: safeInputTokens,
    cachedInputTokens: safeCachedInputTokens,
    outputTokens: safeOutputTokens,
    reasoningOutputTokens: safeReasoningOutputTokens,
    totalTokens: safeTotalTokens,
    webSearchCalls: safeWebSearchCalls,
    durationMs: nonnegativeInteger(durationMs),
    currency: "USD",
    pricingVersion: pricing.version,
    inputPricePerMillionUsd: pricing.inputPricePerMillionUsd,
    cachedInputPricePerMillionUsd: pricing.cachedInputPricePerMillionUsd,
    outputPricePerMillionUsd: pricing.outputPricePerMillionUsd,
    webSearchPricePerCallUsd: pricing.webSearchPricePerCallUsd,
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    webSearchCostUsd,
    estimatedTotalCostUsd,
    estimated: true,
  };
}
