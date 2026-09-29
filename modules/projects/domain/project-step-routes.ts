export const projectStepIds = ["PRODUCT", "OFFERS", "ANALYSIS", "COSTS", "DECISION"] as const;

export type ProjectStepId = typeof projectStepIds[number];

export const projectStepLabels: Record<ProjectStepId, string> = {
  PRODUCT: "Šta želite da kupite?",
  OFFERS: "Izbor ponude",
  ANALYSIS: "Analiza ponude",
  COSTS: "Troškovi uvoza",
  DECISION: "Poređenje i odluka",
};

export function getProjectStepHref(projectId: string, step: ProjectStepId) {
  const base = `/projects/${projectId}`;
  if (step === "PRODUCT") return base;
  if (step === "OFFERS") return `${base}/offers`;
  if (step === "ANALYSIS") return `${base}/analysis`;
  if (step === "COSTS") return `${base}/costs`;
  return `${base}/decision`;
}
