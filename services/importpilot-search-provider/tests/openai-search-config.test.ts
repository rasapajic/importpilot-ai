import { describe, expect, it } from "vitest";

import {
  openAIReasoningEffort,
  openAISearchContextSize,
} from "../src/openai-search-config.js";

describe("OpenAI web-search configuration", () => {
  it("normalizes minimal and unknown reasoning values to low", () => {
    expect(openAIReasoningEffort("minimal")).toBe("low");
    expect(openAIReasoningEffort(undefined)).toBe("low");
    expect(openAIReasoningEffort("unexpected")).toBe("low");
  });

  it("preserves compatible reasoning values", () => {
    expect(openAIReasoningEffort("low")).toBe("low");
    expect(openAIReasoningEffort("medium")).toBe("medium");
    expect(openAIReasoningEffort("high")).toBe("high");
  });

  it("uses low as the safe default web-search context", () => {
    expect(openAISearchContextSize(undefined)).toBe("low");
    expect(openAISearchContextSize("low")).toBe("low");
    expect(openAISearchContextSize("medium")).toBe("medium");
    expect(openAISearchContextSize("high")).toBe("high");
  });
});
