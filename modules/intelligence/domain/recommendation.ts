export const RecommendationStatuses = {
  RECOMMENDED: "RECOMMENDED",
  OK_WITH_RISK: "OK_WITH_RISK",
  NEEDS_NEGOTIATION: "NEEDS_NEGOTIATION",
  NOT_RECOMMENDED: "NOT_RECOMMENDED",
} as const;

export type RecommendationStatusValue =
  (typeof RecommendationStatuses)[keyof typeof RecommendationStatuses];

