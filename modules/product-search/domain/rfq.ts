export type RfqOrderType = "SAMPLE" | "FULL_ORDER";

export type RfqInput = {
  productTitle: string;
  supplierName: string;
  quantity: number;
  deliveryCountry: string;
  deliveryPlace?: string | null;
  orderType: RfqOrderType;
  incoterm?: string | null;
  productUrl?: string | null;
};

export function generateRfqMessage(input: RfqInput) {
  const orderLine = input.orderType === "SAMPLE"
    ? "I would like to request a sample first."
    : `I would like to request a final quotation for ${input.quantity} units.`;
  const delivery = input.deliveryPlace
    ? `${input.deliveryPlace}, ${input.deliveryCountry}`
    : input.deliveryCountry;

  return [
    `Hello ${input.supplierName},`,
    "",
    `I am interested in your product: ${input.productTitle}.`,
    input.productUrl ? `Product link: ${input.productUrl}` : null,
    orderLine,
    `Delivery destination: ${delivery}.`,
    input.incoterm ? `Current Incoterm shown: ${input.incoterm}. Please confirm if this is still valid.` : null,
    "",
    "Please send a final quotation with:",
    "- final unit price and total price;",
    "- confirmation that the requested quantity is available;",
    "- MOQ and possible lower MOQ options;",
    "- sample price and sample shipping cost;",
    "- production lead time;",
    "- delivery time;",
    "- transport cost;",
    "- Incoterm options: EXW / FOB / CIF / DDP;",
    "- payment method and payment terms;",
    "- packaging details;",
    "- carton dimensions, gross weight and net weight;",
    "- required certificates and export documents.",
    "",
    "Please also confirm whether the quoted price is a wholesale/B2B price for the requested quantity.",
    "",
    "Best regards,",
  ].filter(Boolean).join("\n");
}
