import { describe, expect, it } from "vitest";

import {
  createOpenAiUsageReport,
  DEFAULT_OPENAI_PRICING,
} from "../src/ai-cost.js";

describe("OpenAI AI usage costing", () => {
  it("stores raw usage and calculates a versioned estimated cost", () => {
    const report = createOpenAiUsageReport({
      model: "gpt-5-mini",
      responseId: "resp_123",
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 500,
      reasoningOutputTokens: 100,
      totalTokens: 1_500,
      webSearchCalls: 2,
      durationMs: 12_345,
    });

    expect(report).toMatchObject({
      provider: "openai",
      operation: "supplier_search",
      model: "gpt-5-mini",
      responseId: "resp_123",
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 500,
      reasoningOutputTokens: 100,
      totalTokens: 1_500,
      webSearchCalls: 2,
      durationMs: 12_345,
      pricingVersion: DEFAULT_OPENAI_PRICING.version,
      inputCostUsd: 0.0002,
      cachedInputCostUsd: 0.000005,
      outputCostUsd: 0.001,
      webSearchCostUsd: 0.02,
      estimatedTotalCostUsd: 0.021205,
      estimated: true,
    });
  });

  it("never charges more cached tokens than total input tokens", () => {
    const report = createOpenAiUsageReport({
      model: "gpt-5-mini",
      responseId: "resp_456",
      inputTokens: 100,
      cachedInputTokens: 500,
      outputTokens: 0,
      totalTokens: 100,
      webSearchCalls: 0,
      durationMs: 1,
    });

    expect(report.cachedInputTokens).toBe(100);
    expect(report.inputCostUsd).toBe(0);
    expect(report.cachedInputCostUsd).toBe(0.0000025);
  });
});
