import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  join(process.cwd(), "services/importpilot-search-provider/src/server.ts"),
  "utf8",
);
const openAiSource = readFileSync(
  join(process.cwd(), "services/importpilot-search-provider/src/openai-web-search-source.ts"),
  "utf8",
);

describe("JAKOV360 broad supplier candidate pool", () => {
  it("targets forty aggregate candidates with twenty per source", () => {
    expect(serverSource).toContain("TAJA_DEEP_SEARCH_MAX_RESULTS ?? 40");
    expect(serverSource).toContain("TAJA_DEEP_SEARCH_MAX_PER_SOURCE ?? 20");
  });

  it("asks the two primary OpenAI discovery sources for up to fifteen results", () => {
    expect(serverSource).toContain("OPENAI_SEARCH_MAX_RESULTS ?? 15");
    expect(serverSource).toContain("OPENAI_1688_MAX_RESULTS ?? 15");
  });

  it("allows OpenAI web search to return more than the previous ten-result cap", () => {
    expect(openAiSource).toContain("const MAX_RESULTS = 20");
  });
});
