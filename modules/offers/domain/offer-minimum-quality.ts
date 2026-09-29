import { isUsableSupplierName } from "./offer-readiness";

export type OfferMinimumQualityInput = {
  productTitle?: string | null;
  requestedProduct?: string | null;
  supplierName?: string | null;
  unitPrice?: number | string | { toString(): string } | null;
  currency?: string | null;
  productUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export type OfferMinimumQualityIssue =
  | "PRODUCT_TITLE"
  | "SUPPLIER"
  | "CONTACT"
  | "PRODUCT_RELATION"
  | "PRICE"
  | "CURRENCY";

const productAliases: Record<string, string> = {
  charger: "charger",
  punjac: "charger",
  glasses: "glasses",
  naocare: "glasses",
  safety: "safety",
  zastitne: "safety",
  camera: "camera",
  kamera: "camera",
};

const ignoredProductWords = new Set([
  "acceptance",
  "direktan",
  "direct",
  "import",
  "jakov360",
  "primer",
  "projekat",
  "project",
  "pregled",
]);

function normalizedTokens(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !ignoredProductWords.has(token))
    .map((token) => productAliases[token] ?? token);
}

function hasPositivePrice(value: OfferMinimumQualityInput["unitPrice"]) {
  if (value === null || value === undefined) return false;
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) && parsed > 0;
}

function hasValidSellerLink(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.length > 0 &&
      url.pathname.replace(/\/+$/, "").length > 0;
  } catch {
    return false;
  }
}

function hasContact(input: OfferMinimumQualityInput) {
  return hasValidSellerLink(input.productUrl) ||
    Boolean(input.contactEmail?.trim()) ||
    Boolean(input.contactPhone?.trim());
}

export function hasClearProductRelation(productTitle?: string | null, requestedProduct?: string | null) {
  const titleTokens = new Set(normalizedTokens(productTitle));
  const requestedTokens = normalizedTokens(requestedProduct);
  return requestedTokens.length > 0 && requestedTokens.some((token) => titleTokens.has(token));
}

export function getOfferMinimumQuality(input: OfferMinimumQualityInput) {
  const issues: OfferMinimumQualityIssue[] = [];
  if (!input.productTitle?.trim()) issues.push("PRODUCT_TITLE");
  if (!isUsableSupplierName(input.supplierName)) issues.push("SUPPLIER");
  if (!hasContact(input)) issues.push("CONTACT");
  if (!hasClearProductRelation(input.productTitle, input.requestedProduct)) issues.push("PRODUCT_RELATION");
  if (!hasPositivePrice(input.unitPrice)) issues.push("PRICE");
  if (!input.currency || !/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) issues.push("CURRENCY");

  return { ready: issues.length === 0, issues };
}

export function minimumQualityExplanation() {
  return "Ponuda mora imati naziv proizvoda, prodavca, link ili kontakt, povezanu cenu i valutu.";
}
