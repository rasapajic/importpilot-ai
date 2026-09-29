import { getProjectStepHref } from "@/modules/projects/domain/project-step-routes";

export function getProjectCreationDestination(projectId: string, mode: "search" | "url") {
  return mode === "url"
    ? `${getProjectStepHref(projectId, "OFFERS")}?importUrl=1`
    : getProjectStepHref(projectId, "PRODUCT");
}
