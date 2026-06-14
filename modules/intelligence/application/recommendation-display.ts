import type { RecommendationStatus } from "@prisma/client";

export function recommendationBadgeStatus(status: RecommendationStatus) {
  if (status === "RECOMMENDED") return "READY_TO_BUY";
  if (status === "NOT_RECOMMENDED") return "DO_NOT_BUY";
  return "NEGOTIATE_FIRST";
}
