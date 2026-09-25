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
    "- final unit price and total price;",
    "- confirmation that the requested quantity is available;",
    "- MOQ, possible lower MOQ options and all available quantity price tiers;",
    "- production lead time and estimated delivery time;",
    "- transport cost;",
    "- the applicable Incoterm and available Incoterm options;",
    "- payment method and payment terms;",
    "- packaging details, carton dimensions, gross weight and net weight;",
    "- required certificates and export documents.",
    "",
    "Please also confirm whether the quoted price is a wholesale/B2B price for the requested quantity.",
    "",
    "Best regards,",
  ].filter((line): line is string => line !== null).join("\n");
}
