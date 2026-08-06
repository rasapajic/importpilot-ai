import { z } from "zod";

const nonnegativeInteger = z.number().int().nonnegative();
const nonnegativeFinite = z.number().nonnegative().finite();

export const aiUsageEventSchema = z
  .object({
    provider: z.literal("openai"),
    operation: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(120),
    responseId: z.string().trim().min(1).max(200),
    status: z.literal("completed"),
    inputTokens: nonnegativeInteger,
    cachedInputTokens: nonnegativeInteger,
    outputTokens: nonnegativeInteger,
    reasoningOutputTokens: nonnegativeInteger,
    totalTokens: nonnegativeInteger,
    webSearchCalls: nonnegativeInteger,
    durationMs: nonnegativeInteger,
    currency: z.literal("USD"),
    pricingVersion: z.string().trim().min(1).max(80),
    inputPricePerMillionUsd: nonnegativeFinite,
    cachedInputPricePerMillionUsd: nonnegativeFinite,
    outputPricePerMillionUsd: nonnegativeFinite,
    webSearchPricePerCallUsd: nonnegativeFinite,
    inputCostUsd: nonnegativeFinite,
    cachedInputCostUsd: nonnegativeFinite,
    outputCostUsd: nonnegativeFinite,
    webSearchCostUsd: nonnegativeFinite,
    estimatedTotalCostUsd: nonnegativeFinite,
    estimated: z.literal(true),
  })
  .strict();

export const aiUsageEventsSchema = z.array(aiUsageEventSchema).max(20);

export type AiUsageEvent = z.infer<typeof aiUsageEventSchema>;
