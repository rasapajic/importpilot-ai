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

  if (!input.hasFinalRecommendation) {
    return [{ href: "#workflow-step-decision", label: "Proveri isplativost", variant: "PRIMARY" }];
  }

  if (input.decisionStatus === "NEGOTIATE_FIRST") {
    return [{ href: "#negotiation-assistant", label: "Pregovaraj", variant: "PRIMARY" }];
  }

  if (input.decisionStatus === "DO_NOT_BUY") {
    return [{ href: "#workflow-step-offer", label: "Pronađi nove ponude", variant: "PRIMARY" }];
  }

  return [{ href: "#documents", label: "Krenite u kupovinu", variant: "PRIMARY" }];
}
