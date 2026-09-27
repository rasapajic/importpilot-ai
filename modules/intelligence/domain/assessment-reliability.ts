export const MINIMUM_DETAILED_SCORE_CONFIDENCE = 40;

type AssessmentReliabilityInput = {
  confidenceScore: number;
  scoreBreakdown: unknown;
};

export function getSupplierRiskLevel(scoreBreakdown: unknown) {
  if (!scoreBreakdown || typeof scoreBreakdown !== "object" || Array.isArray(scoreBreakdown)) {
    return null;
  }
  const risk = (scoreBreakdown as { supplierRiskV2?: unknown }).supplierRiskV2;
  if (!risk || typeof risk !== "object" || Array.isArray(risk)) return null;
  const level = (risk as { riskLevel?: unknown }).riskLevel;
  return level === "LOW" || level === "MEDIUM" || level === "HIGH" || level === "UNKNOWN"
    ? level
    : null;
}

export function hasReliableDetailedAssessment(input: AssessmentReliabilityInput) {
  return !(
    input.confidenceScore < MINIMUM_DETAILED_SCORE_CONFIDENCE &&
    getSupplierRiskLevel(input.scoreBreakdown) === "UNKNOWN"
  );
}
