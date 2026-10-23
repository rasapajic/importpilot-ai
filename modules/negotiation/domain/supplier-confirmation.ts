import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import { presentSupplierOfferPrice } from "@/modules/product-search/domain/supplier-quantity-pricing";

export const SupplierConfirmationStatuses = {
  FOUND: "FOUND",
  PREPARED: "PREPARED",
  SENT: "SENT",
  RESPONSE_RECEIVED: "RESPONSE_RECEIVED",
  DOCUMENTED: "DOCUMENTED",
} as const;

export type SupplierConfirmationStatus =
  (typeof SupplierConfirmationStatuses)[keyof typeof SupplierConfirmationStatuses];

export const READING_GLASSES_DIOPTERS = [
  "+1.00",
  "+1.50",
  "+2.00",
  "+2.50",
  "+3.00",
  "+3.50",
] as const;

export type ConfirmableSupplierTermKey =
  | "UNIT_PRICE"
  | "ORDER_QUANTITY"
  | "MOQ"
  | "INCOTERM"
  | "LEAD_TIME_DAYS"
  | "DIOPTERS"
  | "VARIANT_MIXING";

export type SupplierTermProposal = {
  key: ConfirmableSupplierTermKey;
  value: string;
  confirmed: boolean;
  evidence: "WRITTEN_QUOTE";
};

export type SupplierConfirmationBrief = {
  supplierName: string;
  productName: string;
  model: string | null;
  quantity: number | null;
  destination: string | null;
  readingGlasses: boolean;
  publicEvidence: string[];
  missing: string[];
  subject: string;
  body: string;
  asks: string[];
};

export type SupplierConfirmationRecord = {
  status: SupplierConfirmationStatus;
  responseNote: string;
  writtenQuote: string;
  proposals: SupplierTermProposal[];
  supplierPriceConfirmed: boolean;
  quantityConfirmed: boolean;
  moqConfirmed: boolean;
  variantsConfirmed: boolean;
  orderTermsConfirmed: boolean;
  transportConfirmed: false;
  customsConfirmed: false;
  vatConfirmed: false;
  otherCostsConfirmed: false;
  additionalConfirmationRequired: boolean;
};

export type ConfirmedCalculationInput = {
  unitPrice: string;
  currency: string;
  quantity: number | null;
  moq: number | null;
  incoterm: string | null;
  deliveryTimeDays: number | null;
  transportConfirmed: false;
  customsConfirmed: false;
  vatConfirmed: false;
  otherCostsConfirmed: false;
};

const DESTINATION_NAMES: Record<string, string> = {
  RS: "Serbia",
  AT: "Austria",
  DE: "Germany",
};

function destinationName(code: string | null) {
  if (!code) return null;
  return DESTINATION_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export function isReadingGlassesProduct(productName: string, title: string) {
  return /\b(?:reading\s+glasses|readers|diopter|dioptre|lesebrille|lesebrillen)\b|naočar|naocar/i
    .test(`${productName} ${title}`);
}

function listedModel(result: SupplierOfferSearchResult) {
  const attribute = result.marketplaceDetails?.attributes.find((item) =>
    /^model(?:\s+number|\s+no\.?)?$/i.test(item.name.trim()),
  );
  return attribute?.value ?? null;
}

function money(amount: number, currency: string) {
  return `${amount} ${currency}`;
}

export function buildSupplierConfirmationBrief(input: {
  result: SupplierOfferSearchResult;
  productName: string;
  quantity: number | null;
  destination: string | null;
}): SupplierConfirmationBrief {
  const { result } = input;
  const quantity = Number.isInteger(input.quantity) && Number(input.quantity) > 0
    ? Number(input.quantity)
    : null;
  const readingGlasses = isReadingGlassesProduct(input.productName, result.title);
  const model = listedModel(result);
  const destination = destinationName(input.destination);
  const price = presentSupplierOfferPrice(result, quantity);
  const publicEvidence: string[] = [];
  const missing = [
    "WRITTEN_SUPPLIER_PRICE",
    "STOCK_OR_PRODUCTION",
    "PACKAGING",
    "DOCUMENTS",
    "TRANSPORT",
    "CUSTOMS",
    "OTHER_COSTS",
  ];

  if (price.kind === "PUBLISHED_TIER" && price.quantityUnitPrice !== null && price.quantityCurrency) {
    publicEvidence.push("PUBLISHED_TIER_PRICE");
    publicEvidence.push("PUBLISHED_TIER_IS_NOT_A_QUOTE");
  } else if (price.kind === "ADVERTISED_ONLY") {
    publicEvidence.push("ADVERTISED_PRICE_NOT_FOR_QUANTITY");
    missing.unshift("QUANTITY_PRICE");
  } else {
    missing.unshift("QUANTITY_PRICE");
  }
  if (
    price.advertisedPrice !== null &&
    price.advertisedAppliesFromQuantity !== null
  ) {
    publicEvidence.push("ADVERTISED_PRICE_APPLIES_LATER");
  }
  if (result.minimumOrderQuantity !== null) {
    publicEvidence.push("LISTED_MOQ_NOT_AN_ORDER_TERM");
  }
  if (result.incoterm) publicEvidence.push("LISTED_INCOTERM");
  else missing.push("INCOTERM");
  missing.push("LEAD_TIME");
  if (readingGlasses) {
    missing.push("DIOPTERS", "VARIANT_MIXING", "MOQ_PER_DIOPTER_COLOR_MODEL");
  } else {
    missing.push("MOQ_PER_VARIANT");
  }

  const quantityText = quantity === null ? "the planned quantity" : `${quantity.toLocaleString("en-US")} pieces`;
  const asks = [
    readingGlasses
      ? `Availability of diopters ${READING_GLASSES_DIOPTERS.join(", ")} mixed in one order.`
      : `Availability of the exact specification for ${input.productName}.`,
    readingGlasses
      ? `Unit price for ${quantityText} in mixed diopters. A public listing price is not a written quotation.`
      : `Unit price for ${quantityText}. A public listing price is not a written quotation.`,
    readingGlasses
      ? "MOQ per diopter, per color, and per model."
      : "MOQ for the order and per variant.",
    "Whether this quantity is available from stock or requires production.",
    "Incoterm and named place, lead time, packaging, and documents for this order.",
  ];

  const known = [
    `Product: ${input.productName}.`,
    model ? `Model: ${model}.` : null,
    quantity === null ? null : `Quantity: ${quantity.toLocaleString("en-US")} pieces.`,
    destination ? `Destination: ${destination}.` : null,
    price.kind === "PUBLISHED_TIER" && price.quantityUnitPrice !== null && price.quantityCurrency
      ? `Public quantity tier covering this quantity: ${money(price.quantityUnitPrice, price.quantityCurrency)}. This is not a written quotation.`
      : null,
    price.advertisedPrice !== null && price.advertisedCurrency && price.advertisedAppliesFromQuantity !== null
      ? `Advertised price ${money(price.advertisedPrice, price.advertisedCurrency)} applies from ${price.advertisedAppliesFromQuantity.toLocaleString("en-US")} pieces, not to this order.`
      : null,
    result.minimumOrderQuantity !== null
      ? `Listing MOQ: ${result.minimumOrderQuantity.toLocaleString("en-US")}. This does not confirm the order.`
      : null,
    result.incoterm ? `Listing Incoterm: ${result.incoterm}. Please confirm it for this order.` : null,
  ].filter((line): line is string => line !== null);

  const subject = `RFQ — please confirm this order — ${input.productName}`;
  const body = [
    `Dear ${result.supplierName} team,`,
    "",
    "We are comparing suppliers and request a written quotation. This message is a request for confirmation, not an order.",
    "",
    ...known,
    "",
    "Please confirm:",
    ...asks.map((ask) => `- ${ask}`),
    "",
    "Please keep freight, customs, and other charges separate from the unit price unless they are included in a named Incoterm.",
    "",
    "Kind regards,",
  ].join("\n");

  return {
    supplierName: result.supplierName,
    productName: input.productName,
    model,
    quantity,
    destination,
    readingGlasses,
    publicEvidence,
    missing,
    subject,
    body,
    asks,
  };
}

function parseNumber(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function quoteLines(text: string) {
  return text.split(/\n|(?<=\.)\s+/).map((line) => line.trim()).filter(Boolean);
}

function isSeparateCharge(line: string) {
  return /\b(?:freight|shipping|shipment|transport|transportation|customs|duty|duties|tariff|carina|zoll|fracht|versand)\b/i.test(line);
}

const VARIANT_MIXING_PATTERN =
  /\b(?:mix(?:ed|ing)?|assort(?:ed|ment)?|mešan\w*|miješan\w*|gemischt\w*|misch(?:bar|en|ung)?)\b/i;
const MIXING_DENIAL_PATTERN =
  /\b(?:cannot|can't|can not|do not|don't|not|without|no|nicht|keine|keinen|ohne|nije|ne mogu|nemoguće|nemoguce)\b/i;

function unitPriceLine(text: string) {
  const lines = quoteLines(text);
  const preferred = lines.find((line) =>
    /\b(?:unit\s+price|piece\s+price|cena|preis)\b/i.test(line) && !isSeparateCharge(line),
  );
  const fallback = lines.find((line) =>
    /(?:\busd\b|us\$|\$)/i.test(line) && !isSeparateCharge(line),
  );
  return preferred ?? fallback ?? null;
}

function unitPriceValue(text: string) {
  const source = unitPriceLine(text);
  if (!source) return null;
  const price = source.match(/(?:usd|us\$|\$)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|us\$)/i);
  return price?.[1] ?? price?.[2] ?? null;
}

export function quotedUnitPriceQuantity(text: string) {
  const source = unitPriceLine(text);
  if (!source) return null;
  const quantity = source.match(/(\d[\d,]*)\s*(?:pcs|pieces|komada|kom)\b/i);
  return quantity?.[1] ? parseNumber(quantity[1]) : null;
}

export function quotedPriceCoversRequestedQuantity(
  writtenQuote: string,
  requestedQuantity: number | null,
) {
  if (requestedQuantity === null) return true;
  const quantity = quotedUnitPriceQuantity(writtenQuote);
  return quantity !== null && quantity === requestedQuantity;
}

function variantMixingValue(text: string) {
  const line = quoteLines(text).find((item) =>
    VARIANT_MIXING_PATTERN.test(item) && !MIXING_DENIAL_PATTERN.test(item),
  );
  return line ? line.slice(0, 180) : null;
}

export function extractSupplierTermProposals(writtenQuote: string): SupplierTermProposal[] {
  const text = writtenQuote.trim();
  if (!text) return [];
  const proposals: SupplierTermProposal[] = [];
  const priceValue = unitPriceValue(text);
  if (priceValue) {
    proposals.push({
      key: "UNIT_PRICE",
      value: `${priceValue} USD`,
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  const quantity = text.match(/(\d[\d,]*)\s*(?:pcs|pieces|komada|kom)\b/i);
  if (quantity?.[1]) {
    proposals.push({
      key: "ORDER_QUANTITY",
      value: quantity[1].replace(/,/g, ""),
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  const moq = text.match(/\bmoq\b\s*[:\-]?\s*(\d[\d,]*)/i);
  if (moq?.[1]) {
    proposals.push({
      key: "MOQ",
      value: moq[1].replace(/,/g, ""),
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  const incoterm = text.match(/\b(EXW|FOB|FCA|CIF|CFR|DAP|DDP)\b/);
  if (incoterm?.[1]) {
    proposals.push({
      key: "INCOTERM",
      value: incoterm[1],
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  const leadTime = text.match(/(\d+)\s*(?:days|working days|dana)\b/i);
  if (leadTime?.[1]) {
    proposals.push({
      key: "LEAD_TIME_DAYS",
      value: leadTime[1],
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  if (/\+1(?:\.00)?\b/i.test(text) && /\+3(?:\.50)?\b/i.test(text)) {
    proposals.push({
      key: "DIOPTERS",
      value: READING_GLASSES_DIOPTERS.join(", "),
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  const mixing = variantMixingValue(text);
  if (mixing) {
    proposals.push({
      key: "VARIANT_MIXING",
      value: mixing,
      confirmed: false,
      evidence: "WRITTEN_QUOTE",
    });
  }
  return proposals;
}

function proposal(
  record: Pick<SupplierConfirmationRecord, "proposals">,
  key: ConfirmableSupplierTermKey,
) {
  return record.proposals.find((item) => item.key === key) ?? null;
}

const unconfirmedCosts = {
  transportConfirmed: false as const,
  customsConfirmed: false as const,
  vatConfirmed: false as const,
  otherCostsConfirmed: false as const,
};

export function applyConfirmationState(
  record: SupplierConfirmationRecord,
  brief: Pick<SupplierConfirmationBrief, "quantity" | "readingGlasses">,
): SupplierConfirmationRecord {
  const statedQuantity = proposal(record, "ORDER_QUANTITY");
  const statedMoq = proposal(record, "MOQ");
  const statedMixing = proposal(record, "VARIANT_MIXING");
  const quantity = statedQuantity ? parseNumber(statedQuantity.value) : null;
  const moq = statedMoq ? parseNumber(statedMoq.value) : null;
  const priceCoversRequestedQuantity = quotedPriceCoversRequestedQuantity(
    record.writtenQuote,
    brief.quantity,
  );
  const supplierPriceConfirmed = proposal(record, "UNIT_PRICE")?.confirmed === true
    && record.writtenQuote.trim().length > 0
    && priceCoversRequestedQuantity;
  const quantityConfirmed = statedQuantity?.confirmed === true
    && quantity !== null
    && (brief.quantity === null || quantity >= brief.quantity);
  const moqConfirmed = statedMoq?.confirmed === true
    && moq !== null
    && (brief.quantity === null || moq <= brief.quantity);
  const variantsConfirmed = brief.readingGlasses
    && statedMixing?.confirmed === true
    && priceCoversRequestedQuantity;
  const orderTermsConfirmed = supplierPriceConfirmed
    && quantityConfirmed
    && moqConfirmed
    && (!brief.readingGlasses || variantsConfirmed);
  const replySaved = record.writtenQuote.trim().length > 0 || record.responseNote.trim().length > 0;
  const quantityGap = brief.quantity !== null && (
    quantity === null ||
    quantity < brief.quantity ||
    moq === null ||
    moq > brief.quantity
  );
  const priceQuantityGap = proposal(record, "UNIT_PRICE") !== null && !priceCoversRequestedQuantity;
  const diopterGap = brief.readingGlasses && !variantsConfirmed;
  const status = supplierPriceConfirmed
    ? SupplierConfirmationStatuses.DOCUMENTED
    : record.status;

  return {
    ...record,
    status,
    supplierPriceConfirmed,
    quantityConfirmed,
    moqConfirmed,
    variantsConfirmed,
    orderTermsConfirmed,
    ...unconfirmedCosts,
    additionalConfirmationRequired: replySaved && (quantityGap || priceQuantityGap || diopterGap),
  };
}

export function additionalConfirmationRequired(
  record: Pick<SupplierConfirmationRecord, "proposals" | "responseNote" | "writtenQuote">,
  brief: Pick<SupplierConfirmationBrief, "quantity" | "readingGlasses">,
) {
  return applyConfirmationState({
    ...createPreparedConfirmation(),
    ...record,
    proposals: record.proposals,
  }, brief).additionalConfirmationRequired;
}

export function createPreparedConfirmation(): SupplierConfirmationRecord {
  return {
    status: SupplierConfirmationStatuses.PREPARED,
    responseNote: "",
    writtenQuote: "",
    proposals: [],
    supplierPriceConfirmed: false,
    quantityConfirmed: false,
    moqConfirmed: false,
    variantsConfirmed: false,
    orderTermsConfirmed: false,
    ...unconfirmedCosts,
    additionalConfirmationRequired: false,
  };
}

export function confirmedCalculationInput(
  record: SupplierConfirmationRecord,
): ConfirmedCalculationInput | null {
  const price = proposal(record, "UNIT_PRICE");
  const match = price?.confirmed === true
    ? price.value.match(/^(\d+(?:\.\d+)?) ([A-Z]{3})$/)
    : null;
  if (!record.supplierPriceConfirmed || !match) return null;
  const quantity = proposal(record, "ORDER_QUANTITY");
  const moq = proposal(record, "MOQ");
  const incoterm = proposal(record, "INCOTERM");
  const leadTime = proposal(record, "LEAD_TIME_DAYS");
  const quantityValue = quantity?.confirmed === true && record.quantityConfirmed
    ? parseNumber(quantity.value)
    : null;
  const moqValue = moq?.confirmed === true && record.moqConfirmed
    ? parseNumber(moq.value)
    : null;
  const leadTimeValue = leadTime?.confirmed === true ? parseNumber(leadTime.value) : null;
  return {
    unitPrice: match[1],
    currency: match[2],
    quantity: quantityValue,
    moq: moqValue,
    incoterm: incoterm?.confirmed === true ? incoterm.value : null,
    deliveryTimeDays: leadTimeValue !== null && Number.isInteger(leadTimeValue) ? leadTimeValue : null,
    ...unconfirmedCosts,
  };
}

export function markInquirySent(record: SupplierConfirmationRecord): SupplierConfirmationRecord {
  if (record.status === SupplierConfirmationStatuses.FOUND) return record;
  if (record.status !== SupplierConfirmationStatuses.PREPARED) return record;
  return { ...record, status: SupplierConfirmationStatuses.SENT };
}

export function saveSupplierReply(
  record: SupplierConfirmationRecord,
  brief: Pick<SupplierConfirmationBrief, "quantity" | "readingGlasses">,
  input: { responseNote: string; writtenQuote: string },
): SupplierConfirmationRecord {
  const responseNote = input.responseNote.trim();
  const writtenQuote = input.writtenQuote.trim();
  if (!responseNote && !writtenQuote) return record;
  if (
    record.status === SupplierConfirmationStatuses.FOUND ||
    record.status === SupplierConfirmationStatuses.PREPARED
  ) {
    return record;
  }
  return applyConfirmationState({
    ...record,
    status: SupplierConfirmationStatuses.RESPONSE_RECEIVED,
    responseNote,
    writtenQuote,
    proposals: extractSupplierTermProposals(writtenQuote),
  }, brief);
}

export function confirmSupplierTerm(
  record: SupplierConfirmationRecord,
  brief: Pick<SupplierConfirmationBrief, "quantity" | "readingGlasses">,
  key: ConfirmableSupplierTermKey,
): SupplierConfirmationRecord {
  if (!record.proposals.some((item) => item.key === key)) return record;
  if (!record.writtenQuote.trim()) return record;
  return applyConfirmationState({
    ...record,
    proposals: record.proposals.map((item) =>
      item.key === key ? { ...item, confirmed: true } : item,
    ),
  }, brief);
}

export function transferredSupplierQuote(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const confirmation = (metadata as { supplierConfirmation?: unknown }).supplierConfirmation;
  if (!confirmation || typeof confirmation !== "object") return null;
  const value = confirmation as { supplierPriceConfirmed?: unknown; orderTermsConfirmed?: unknown };
  if (value.supplierPriceConfirmed !== true) return null;
  return {
    supplierPriceConfirmed: true,
    orderTermsConfirmed: value.orderTermsConfirmed === true,
    ...unconfirmedCosts,
  };
}

export function calculationSupersededAt(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const confirmation = (metadata as {
    supplierConfirmation?: { calculationSupersededAt?: unknown };
  }).supplierConfirmation;
  const value = confirmation?.calculationSupersededAt;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}
