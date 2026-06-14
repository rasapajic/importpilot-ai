export type ProjectWorkflowStepId =
  | "PRODUCT"
  | "OFFER"
  | "COST"
  | "ANALYSIS"
  | "DECISION"
  | "NEGOTIATION";

export type ProjectWorkflowStepStatus = "COMPLETED" | "ACTIVE" | "LOCKED" | "HIDDEN";

export type ProjectWorkflowInput = {
  offerCount: number;
  calculatedOfferCount: number;
  assessedOfferCount: number;
  assessedCalculatedOfferCount?: number;
  hasDecision: boolean;
  decisionStatus: string | null;
};

export type ProjectWorkflowStep = {
  id: ProjectWorkflowStepId;
  status: ProjectWorkflowStepStatus;
};

export function getProjectWorkflow(input: ProjectWorkflowInput): ProjectWorkflowStep[] {
  const hasOffer = input.offerCount > 0;
  const hasCalculation = input.calculatedOfferCount > 0;
  const allCalculatedOffersAssessed =
    hasCalculation &&
    (input.assessedCalculatedOfferCount ?? input.assessedOfferCount) >= input.calculatedOfferCount;
  const allActiveOffersAssessed =
    hasOffer && input.assessedOfferCount >= input.offerCount;
  const shouldNegotiate =
    allActiveOffersAssessed &&
    input.hasDecision &&
    input.decisionStatus === "NEGOTIATE_FIRST";

  return [
    { id: "PRODUCT", status: "COMPLETED" },
    { id: "OFFER", status: hasOffer ? "COMPLETED" : "ACTIVE" },
    {
      id: "COST",
      status: !hasOffer ? "LOCKED" : hasCalculation ? "COMPLETED" : "ACTIVE",
    },
    {
      id: "ANALYSIS",
      status: !hasCalculation ? "LOCKED" : allCalculatedOffersAssessed ? "COMPLETED" : "ACTIVE",
    },
    {
      id: "DECISION",
      status: !allActiveOffersAssessed ? "LOCKED" : input.hasDecision ? "COMPLETED" : "ACTIVE",
    },
    { id: "NEGOTIATION", status: shouldNegotiate ? "ACTIVE" : "HIDDEN" },
  ];
}
