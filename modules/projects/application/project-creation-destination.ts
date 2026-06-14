export function getProjectCreationDestination(projectId: string, mode: "search" | "url") {
  return `/projects/${projectId}${mode === "url" ? "?importUrl=1#workflow-step-offer" : ""}`;
}
