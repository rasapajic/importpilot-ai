import type { ProjectDecisionStatusValue } from "../domain/project-decision";

export function getSimplifiedNextActions(status: ProjectDecisionStatusValue) {
  if (status === "READY_TO_BUY" || status === "NEGOTIATE_FIRST" || status === "DO_NOT_BUY") {
    return [];
  }
  return ["Pronađi bolje ponude"];
}
