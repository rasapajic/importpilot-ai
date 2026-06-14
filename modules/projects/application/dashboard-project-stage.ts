import { isFinalDecisionStatus } from "../../decisions/application/decision-step-summary";

export type DashboardProjectStageInput = {
  offerCount: number;
  hasAssessment: boolean;
  latestDecisionStatus: string | null;
};

export function getDashboardProjectStage(input: DashboardProjectStageInput) {
  if (isFinalDecisionStatus(input.latestDecisionStatus)) return "Odluka spremna";
  if (input.hasAssessment) return "Čeka analizu";
  if (input.offerCount > 0) return "Ponude pronađene";
  return "Traženje ponuda";
}
