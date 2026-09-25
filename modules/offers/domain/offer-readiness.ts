export type OfferReadinessInput = {
  supplierName?: string | null;
  unitPrice?: number | string | { toString(): string } | null;
  currency?: string | null;
  moq?: number | null;
  sourceMetadata?: unknown;
};

export type OfferReadiness = {
  ready: boolean;
  missingFields: Array<"SUPPLIER" | "PRICE" | "CURRENCY" | "MOQ">;
  confirmationIssues: Array<"AVAILABILITY" | "B2B_PRICE" | "OFFER_TYPE">;
};

const unknownSupplierNames = new Set([
  "unknown",
  "unknown supplier",
  "unconfirmed seller",
  "nepotvrdjen prodavac",
  "nepotvrđen prodavac",
  "nije poznato",
  "not provided",
  "unavailable",
]);

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isUsableSupplierName(value?: string | null) {
  const normalized = value?.trim().toLocaleLowerCase("sr-Latn") ?? "";
  return normalized.length > 0 && !unknownSupplierNames.has(normalized);
}

function hasPositivePrice(value: OfferReadinessInput["unitPrice"]) {
  if (value === null || value === undefined) return false;
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function getOfferReadiness(input: OfferReadinessInput): OfferReadiness {
  const missingFields: OfferReadiness["missingFields"] = [];
  if (!isUsableSupplierName(input.supplierName)) missingFields.push("SUPPLIER");
  if (!hasPositivePrice(input.unitPrice)) missingFields.push("PRICE");
  if (!input.currency || !/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) {
    missingFields.push("CURRENCY");
  }
  if (!Number.isInteger(input.moq) || (input.moq ?? 0) <= 0) missingFields.push("MOQ");

  const metadata = metadataRecord(input.sourceMetadata);
  const confirmationIssues: OfferReadiness["confirmationIssues"] = [];
  if (metadata.availabilityConfirmed === false) confirmationIssues.push("AVAILABILITY");
  if (metadata.offerType === "UNKNOWN") confirmationIssues.push("OFFER_TYPE");
  if (metadata.offerType === "DOMESTIC" && metadata.b2bPriceConfirmed !== true) {
    confirmationIssues.push("B2B_PRICE");
  } else if (metadata.b2bPriceConfirmed === false) {
    confirmationIssues.push("B2B_PRICE");
  }

  return {
    ready: missingFields.length === 0 && confirmationIssues.length === 0,
    missingFields,
    confirmationIssues,
  };
}

export function readinessExplanation(readiness: OfferReadiness) {
  if (readiness.missingFields.length > 0) {
    return "Supplier, price, currency and MOQ are required before analysis.";
  }
  if (readiness.confirmationIssues.includes("B2B_PRICE")) {
    return "The wholesale/B2B price must be confirmed.";
  }
  if (readiness.confirmationIssues.includes("AVAILABILITY")) {
    return "Availability of the requested quantity must be confirmed.";
  }
  if (readiness.confirmationIssues.includes("OFFER_TYPE")) {
    return "The offer type must be confirmed.";
  }
  return "The offer is ready for analysis.";
}
