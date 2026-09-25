export type RfqOrderType = "SAMPLE" | "FULL_ORDER";

export type RfqInput = {
  productTitle: string;
  supplierName: string;
  quantity: number;
  deliveryCountry: string;
  deliveryPlace?: string | null;
  deliveryCity?: string | null;
  postalCode?: string | null;
  orderType: RfqOrderType;
  incoterm?: string | null;
  productUrl?: string | null;
};

const unknownSupplierNames = [
  "unknown",
  "unknown supplier",
  "unconfirmed seller",
  "nepotvrđen prodavac",
  "nepotvrdjen prodavac",
  "nije poznato",
];

function greeting(supplierName: string) {
  const normalized = supplierName.trim().toLocaleLowerCase("sr-Latn");
  return !normalized || unknownSupplierNames.includes(normalized)
    ? "Hello Sales Team,"
    : `Hello ${supplierName.trim()},`;
}

export function generateRfqMessage(input: RfqInput) {
  const city = input.deliveryCity?.trim() || input.deliveryPlace?.trim();
  const delivery = [input.postalCode?.trim(), city, input.deliveryCountry].filter(Boolean).join(" ");
  const introduction = [
    greeting(input.supplierName),
    "",
    `I am interested in your product: ${input.productTitle}.`,
    input.productUrl ? `Product link: ${input.productUrl}` : null,
  ].filter((line): line is string => line !== null);

  if (input.orderType === "SAMPLE") {
    return [
      ...introduction,
      "I would like to request a sample, or a small number of sample units, before placing a full order.",
      `Sample delivery destination: ${delivery}.`,
      "",
      "Please confirm:",
      "- the price for one sample and any available multi-sample option;",
      "- the sample shipping cost;",
      "- dispatch time and estimated delivery time;",
      "- accepted payment method for the sample;",
      "- whether the sample cost can be credited toward a later full order;",
      "- any certificates currently available for this product.",
      "",
      "Best regards,",
    ].join("\n");
  }

  return [
    ...introduction,
    `I would like to request a final quotation for ${input.quantity} units at wholesale/B2B pricing.`,
    `Delivery destination: ${delivery}.`,
    input.incoterm ? `Current Incoterm shown: ${input.incoterm}. Please confirm if this is still valid.` : null,
    "",
    "Please send a final quotation with:",
    `- final unit price and total price for ${input.quantity} units;`,
    "- confirmation that the requested quantity is available and the quotation is wholesale/B2B;",
    "- MOQ, possible lower MOQ options and all available quantity price tiers;",
    "- the applicable Incoterm and available Incoterm options;",
    `- transport method and cost to ${delivery};`,
    "- cargo insurance cost and coverage, or confirmation that insurance is not included;",
    "- production lead time and estimated delivery time;",
    "- payment method and payment terms;",
    "- packaging details, carton dimensions, carton count, gross weight and net weight;",
    "- your proposed full HS/tariff code and the country of origin;",
    "- required certificates and export documents;",
    "- a DDP price and a clear DDP cost breakdown, if you offer DDP delivery.",
    "",
    "Any customs duty information you provide will be treated as a proposal and verified against the official source for the destination country.",
    "",
    "Best regards,",
  ].filter((line): line is string => line !== null).join("\n");
}
