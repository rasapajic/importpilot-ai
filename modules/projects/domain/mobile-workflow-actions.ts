import { getProjectStepHref, type ProjectStepId } from "./project-step-routes";

export type MobileWorkflowAction = {
  href: string;
  label: string;
  variant: "PRIMARY" | "SECONDARY";
};

export type MobileWorkflowActionInput = {
  projectId: string;
  offerCount: number;
  calculatedOfferCount: number;
  assessedOfferCount: number;
  hasFinalRecommendation: boolean;
  decisionStatus: string | null;
  currentStep: ProjectStepId;
};

export function getMobileWorkflowActions(input: MobileWorkflowActionInput): MobileWorkflowAction[] {
  if (input.currentStep === "PRODUCT") {
    return [{ href: getProjectStepHref(input.projectId, "OFFERS"), label: "Nastavi na izbor ponude", variant: "PRIMARY" }];
  }

  if (input.currentStep === "OFFERS") {
    if (input.offerCount > 0) {
      return [{ href: getProjectStepHref(input.projectId, "ANALYSIS"), label: "Nastavi na analizu", variant: "PRIMARY" }];
    }
    return [{ href: getProjectStepHref(input.projectId, "OFFERS"), label: "Dodaj ponudu", variant: "PRIMARY" }];
  }

  if (input.currentStep === "ANALYSIS") {
    if (input.assessedOfferCount > 0) {
      return [{ href: getProjectStepHref(input.projectId, "COSTS"), label: "Nastavi na troškove uvoza", variant: "PRIMARY" }];
    }
    return [{ href: getProjectStepHref(input.projectId, "ANALYSIS"), label: "Analiziraj", variant: "PRIMARY" }];
  }

  if (input.currentStep === "COSTS") {
    if (input.calculatedOfferCount > 0) {
      return [{ href: getProjectStepHref(input.projectId, "DECISION"), label: "Nastavi na poređenje i odluku", variant: "PRIMARY" }];
    }
    return [{ href: getProjectStepHref(input.projectId, "COSTS"), label: "Izračunaj", variant: "PRIMARY" }];
  }

  if (!input.hasFinalRecommendation) {
    return [];
  }

  return [
    { href: `/projects/${input.projectId}/summary`, label: "PDF", variant: "PRIMARY" },
    {
      href: input.decisionStatus === "NEGOTIATE_FIRST"
        ? `${getProjectStepHref(input.projectId, "DECISION")}#negotiation-assistant`
        : getProjectStepHref(input.projectId, "DECISION"),
      label: "Kontakt",
      variant: "SECONDARY",
    },
    {
      href: getProjectStepHref(input.projectId, "OFFERS"),
      label: "Izaberi drugu ponudu",
      variant: "SECONDARY",
    },
  ];
}
