export const NegotiationTones = {
  FORMAL: "FORMAL",
  DIRECT: "DIRECT",
  FRIENDLY: "FRIENDLY",
} as const;

export type NegotiationToneValue =
  (typeof NegotiationTones)[keyof typeof NegotiationTones];

export const NegotiationRequests = {
  LOWER_MOQ: "LOWER_MOQ",
  BETTER_PRICE: "BETTER_PRICE",
  CONFIRM_INCOTERM: "CONFIRM_INCOTERM",
  CONFIRM_SHIPPING: "CONFIRM_SHIPPING",
  REQUEST_SAMPLE: "REQUEST_SAMPLE",
  FINAL_PROFORMA_INVOICE: "FINAL_PROFORMA_INVOICE",
} as const;

export type NegotiationRequestValue =
  (typeof NegotiationRequests)[keyof typeof NegotiationRequests];

export type NegotiationFacts = {
  supplierName: string;
  projectName: string;
  projectQuantity: number;
  projectDecisionStatus: string;
  recommendationStatus: string | null;
  currency: string | null;
  unitPrice: number | null;
  moq: number | null;
  incoterm: string | null;
  landedCostPerUnit: number | null;
  supplierRiskScore: number | null;
  overallScore: number | null;
};

export type NegotiationDraft = {
  tone: NegotiationToneValue;
  requestTypes: NegotiationRequestValue[];
  lockedFacts: NegotiationFacts;
  subject: string;
  body: string;
};

const checklistRequestMap: Record<string, NegotiationRequestValue | undefined> = {
  REQUEST_SAMPLE: NegotiationRequests.REQUEST_SAMPLE,
  CONFIRM_INCOTERM: NegotiationRequests.CONFIRM_INCOTERM,
  CONFIRM_SHIPPING: NegotiationRequests.CONFIRM_SHIPPING,
  NEGOTIATE_MOQ: NegotiationRequests.LOWER_MOQ,
};

export function deriveNegotiationRequests(
  checklistKeys: string[],
  decisionStatus: string,
  facts?: Pick<NegotiationFacts, "moq">,
): NegotiationRequestValue[] {
  const requests = checklistKeys.flatMap((key) => {
    const mapped = checklistRequestMap[key];
    return mapped ? [mapped] : [];
  });
  if (facts?.moq === null) requests.push(NegotiationRequests.LOWER_MOQ);
  if (decisionStatus !== "READY_TO_BUY") requests.push(NegotiationRequests.BETTER_PRICE);
  requests.push(NegotiationRequests.FINAL_PROFORMA_INVOICE);
  return [...new Set(requests)];
}

function greeting(tone: NegotiationToneValue, supplierName: string) {
  if (tone === NegotiationTones.FORMAL) return `Dear ${supplierName} team,`;
  if (tone === NegotiationTones.DIRECT) return `Hello ${supplierName},`;
  return `Hi ${supplierName} team,`;
}

function opening(tone: NegotiationToneValue, projectName: string) {
  if (tone === NegotiationTones.FORMAL) {
    return `Thank you for your offer for ${projectName}. We have completed our internal review and would appreciate your confirmation on the points below.`;
  }
  if (tone === NegotiationTones.DIRECT) {
    return `We reviewed your offer for ${projectName}. Please confirm and improve the following points:`;
  }
  return `Thank you for sharing your offer for ${projectName}. We are interested in moving forward and would like to align on a few points:`;
}

function closing(tone: NegotiationToneValue) {
  if (tone === NegotiationTones.FORMAL) {
    return "We look forward to receiving your revised offer and final proforma invoice.\n\nKind regards,";
  }
  if (tone === NegotiationTones.DIRECT) {
    return "Please send your revised offer and final proforma invoice.\n\nRegards,";
  }
  return "We look forward to your revised offer and final proforma invoice. Thank you!\n\nBest regards,";
}

function requestLine(request: NegotiationRequestValue, facts: NegotiationFacts) {
  switch (request) {
    case NegotiationRequests.LOWER_MOQ:
      return facts.moq === null
        ? `Please confirm your MOQ and whether you can accept our planned order quantity of ${facts.projectQuantity} units.`
        : `Please confirm whether the MOQ of ${facts.moq} units can be reduced to our planned quantity of ${facts.projectQuantity} units.`;
    case NegotiationRequests.BETTER_PRICE:
      return facts.unitPrice !== null && facts.currency
        ? `Please provide your best revised unit price compared with the current offer of ${facts.unitPrice} ${facts.currency}.`
        : "Please provide your best revised unit price.";
    case NegotiationRequests.CONFIRM_INCOTERM:
      return facts.incoterm
        ? `Please confirm that the quoted Incoterm is ${facts.incoterm} and specify the named place or port.`
        : "Please confirm the applicable Incoterm and the named place or port.";
    case NegotiationRequests.CONFIRM_SHIPPING:
      return "Please confirm the shipping method, total shipping cost, lead time, and what is included in the quotation. Please also provide packing details: units per carton, carton dimensions, gross and net weight per carton, total number of cartons, and total CBM.";
    case NegotiationRequests.REQUEST_SAMPLE:
      return "Please confirm sample availability, sample cost, and delivery time.";
    case NegotiationRequests.FINAL_PROFORMA_INVOICE:
      return "Please provide a final proforma invoice including product specification, confirmed MOQ, quantity, unit price, Incoterm, shipping, packing details, payment terms, and lead time.";
  }
}

export function generateNegotiationMessage(
  tone: NegotiationToneValue,
  facts: NegotiationFacts,
  requestTypes: NegotiationRequestValue[],
): NegotiationDraft {
  const uniqueRequests = [...new Set(requestTypes)];
  const lines = uniqueRequests.map((request) => `- ${requestLine(request, facts)}`);
  const subject = `Request for revised offer and confirmation - ${facts.projectName}`;
  const body = [
    greeting(tone, facts.supplierName),
    "",
    opening(tone, facts.projectName),
    "",
    ...lines,
    "",
    closing(tone),
  ].join("\n");

  return { tone, requestTypes: uniqueRequests, lockedFacts: facts, subject, body };
}
