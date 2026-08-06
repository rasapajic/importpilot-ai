export type OpenAISearchContextSize = "low" | "medium" | "high";
export type OpenAIReasoningEffort = "low" | "medium" | "high";

export function openAISearchContextSize(
  value: string | undefined,
): OpenAISearchContextSize {
  return value === "medium" || value === "high" ? value : "low";
}

export function openAIReasoningEffort(
  value: string | undefined,
): OpenAIReasoningEffort {
  // The Responses web_search tool rejects `minimal` for the current
  // gpt-5-mini integration. Unknown, empty and legacy `minimal` values
  // therefore fall back to the lowest compatible effort: `low`.
  return value === "medium" || value === "high" ? value : "low";
}
