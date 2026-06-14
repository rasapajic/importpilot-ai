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
};

export function getMobileWorkflowActions(input: MobileWorkflowActionInput): MobileWorkflowAction[] {
  if (input.offerCount === 0) {
    return [{ href: "#workflow-step-offer", label: "Dodaj ponudu", variant: "PRIMARY" }];
  }

  if (input.calculatedOfferCount < input.offerCount) {
    return [{ href: "#workflow-step-decision", label: "Izračunaj", variant: "PRIMARY" }];
  }

  if (input.assessedOfferCount < input.offerCount) {
    return [{ href: "#workflow-step-decision", label: "Oceni", variant: "PRIMARY" }];
  }

  if (!input.hasFinalRecommendation) {
    return [{ href: "#workflow-step-decision", label: "Generiši preporuku", variant: "PRIMARY" }];
  }

  return [
    { href: `/projects/${input.projectId}/summary`, label: "PDF", variant: "PRIMARY" },
    {
      href: input.decisionStatus === "NEGOTIATE_FIRST" ? "#negotiation-assistant" : "#workflow-step-next",
      label: "Kontakt",
      variant: "SECONDARY",
    },
    {
      href: `/projects/${input.projectId}?newAnalysis=1#workflow-step-decision`,
      label: "Nova analiza",
      variant: "SECONDARY",
    },
  ];
}
