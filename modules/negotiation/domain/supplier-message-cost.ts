import type { AiUsageEvent } from "@/modules/ai-usage/domain/ai-usage";

export const SUPPLIER_MESSAGE_PRICING = {
  version: "openai-standard-2026-08-06",
  inputPricePerMillionUsd: 0.25,
  cachedInputPricePerMillionUsd: 0.025,
  outputPricePerMillionUsd: 2,
  webSearchPricePerCallUsd: 0,
};

type UsageInput = {
  operation: string;
  model: string;
  responseId: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  totalTokens: number;
  durationMs: number;
  pricing?: typeof SUPPLIER_MESSAGE_PRICING;
};

function whole(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

function money(value: number) {
  return Number(Math.max(0, value).toFixed(12));
}

export function supplierMessageUsageEvent({
  operation,
  model,
  responseId,
  inputTokens,
  cachedInputTokens = 0,
  outputTokens,
  reasoningOutputTokens = 0,
  totalTokens,
  durationMs,
  pricing = SUPPLIER_MESSAGE_PRICING,
}: UsageInput): AiUsageEvent {
  const safeInputTokens = whole(inputTokens);
  const safeCachedInputTokens = Math.min(safeInputTokens, whole(cachedInputTokens));
  const safeOutputTokens = whole(outputTokens);
  const inputCostUsd = money(
    ((safeInputTokens - safeCachedInputTokens) / 1_000_000) * pricing.inputPricePerMillionUsd,
  );
  const cachedInputCostUsd = money(
    (safeCachedInputTokens / 1_000_000) * pricing.cachedInputPricePerMillionUsd,
  );
  const outputCostUsd = money((safeOutputTokens / 1_000_000) * pricing.outputPricePerMillionUsd);
  return {
    provider: "openai",
    operation,
    model,
    responseId,
    status: "completed",
    inputTokens: safeInputTokens,
    cachedInputTokens: safeCachedInputTokens,
    outputTokens: safeOutputTokens,
    reasoningOutputTokens: Math.min(safeOutputTokens, whole(reasoningOutputTokens)),
    totalTokens: Math.max(safeInputTokens + safeOutputTokens, whole(totalTokens)),
    webSearchCalls: 0,
    durationMs: whole(durationMs),
    currency: "USD",
    pricingVersion: pricing.version,
    inputPricePerMillionUsd: pricing.inputPricePerMillionUsd,
    cachedInputPricePerMillionUsd: pricing.cachedInputPricePerMillionUsd,
    outputPricePerMillionUsd: pricing.outputPricePerMillionUsd,
    webSearchPricePerCallUsd: pricing.webSearchPricePerCallUsd,
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    webSearchCostUsd: 0,
    estimatedTotalCostUsd: money(inputCostUsd + cachedInputCostUsd + outputCostUsd),
    estimated: true,
  };
}
