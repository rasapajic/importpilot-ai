import type { ActionItem, ProjectDecisionStatusValue } from "../domain/project-decision";
import { getDisplayedProfitSummary } from "../../cost-engine/application/calculation-summary";

export function getDecisionExpectedProfit(input: {
  targetSellingPrice: string;
  landedCostPerUnit: string;
  quantity: number;
} | null) {
  if (!input) return null;
  return getDisplayedProfitSummary(input).totalProfit;
}

export function getDecisionNextActions(
  status: ProjectDecisionStatusValue,
  checklist: ActionItem[],
) {
  const keys = new Set(checklist.map((item) => item.key));
  const actions: string[] = [];

  if (status !== "DO_NOT_BUY") actions.push("Contact supplier");
  if (keys.has("REQUEST_SAMPLE")) actions.push("Request sample");
  if (status === "NEGOTIATE_FIRST" || keys.has("NEGOTIATE_MOQ")) actions.push("Negotiate");
  actions.push("Add import documents");

  return actions;
}
