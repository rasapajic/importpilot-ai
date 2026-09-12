import {
  marketplaceProductDetailsSchema,
  productPreviewSchema,
  type MarketplaceProductDetails,
  type ProductPreview,
} from "./contract.js";

export function detectProvider(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === "alibaba.com" || host.endsWith(".alibaba.com")) return "alibaba";
  if (host === "made-in-china.com" || host.endsWith(".made-in-china.com")) return "made-in-china";
  return "unknown";
}

export function hasProductIdentifier(url: URL) {
  const value = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  const provider = detectProvider(url);
  if (provider === "alibaba") {
    return /product-detail|product\/|_\d+\.html|\/p-detail\//.test(value) ||
      url.hostname.toLowerCase().startsWith("s.");
  }
  if (provider === "made-in-china") {
    return /\/product\/|\/productdetail\/|\/product-detail\/|_[a-z0-9]+\.html|\/pd\//i.test(value);
  }
  return false;
}

export function isBlockedHtml(html: string) {
  return /captcha|anti[-\s]?bot|robot check|verify you are human|access denied|unusual traffic|security check/i.test(html);
}

function decodeHtml(value: string | null | undefined) {
  return value
    ?.replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim() || null;
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")) ?? "";
}

function regexText(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = decodeHtml(match?.[1]?.replace(/<[^>]+>/g, " "));
    if (value) return value;
  }
  return null;
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return regexText(html, [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ]);
}

function attribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(tag.match(new RegExp(`\\b${escaped}=["']([^"']+)["']`, "i"))?.[1]);
}

function embeddedJsonString(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = regexText(html, [
      new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"),
      new RegExp(`'${escaped}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, "i"),
    ]);
    if (value) return value.replace(/\\"/g, "\"").replace(/\\\//g, "/");
  }
  return null;
}

function embeddedJsonNumber(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = regexText(html, [
      new RegExp(`"${escaped}"\\s*:\\s*"?([0-9]+(?:[.,][0-9]+)?)"?`, "i"),
      new RegExp(`'${escaped}'\\s*:\\s*'?([0-9]+(?:[.,][0-9]+)?)'?`, "i"),
    ]);
    if (value) return value.replace(",", ".");
  }
  return null;
}

function normalizeCurrency(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "$" ||
    normalized.includes("US $") ||
    normalized.includes("US$") ||
    normalized.includes("USD")
  ) return "USD";
  if (normalized === "€" || normalized.includes("EUR")) return "EUR";
  if (normalized.includes("GBP") || normalized.includes("£")) return "GBP";
  if (normalized.includes("CNY") || normalized.includes("RMB") || normalized.includes("¥")) return "CNY";
  return normalized.match(/\b[A-Z]{3}\b/)?.[0] ?? null;
}

function normalizeUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function isGenericTitle(value: string | null) {
  if (!value) return true;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return [
    "english",
    "deutsch",
    "español",
    "espanol",
    "made-in-china.com",
    "home",
    "products",
    "product",
    "supplier",
    "suppliers",
  ].includes(normalized);
}

function cleanTitle(value: string | null) {
  if (!value || isGenericTitle(value)) return null;
  return value;
}

const COMPANY_SUFFIX_SOURCE = "(?:Co\\.,?\\s*Ltd\\.?|Company\\s+Limited|Limited|Ltd\\.?|Factory|Manufacturer)";
const COMPANY_SUFFIX_PATTERN = new RegExp(`\\b${COMPANY_SUFFIX_SOURCE}\\s*$`, "i");
const PLATFORM_COMPANY_PATTERN = /\b(?:Made-in-China(?:\.com)?|Focus\s+Technology|Google|Facebook|Microsoft)\b/i;

function cleanSupplierName(value: string | null) {
  if (!value) return null;
  const decoded = decodeHtml(value.replace(/<[^>]+>/g, " "));
  if (!decoded) return null;
  if (/class\s*=|button|chat|j-sr|supplier-chat/i.test(decoded)) return null;
  let normalized = decoded
    .replace(/^(?:verified\s+supplier|secured\s+trading|supplier|manufacturer|company\s+name)\s*[:\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const companyMatch = normalized.match(new RegExp(
    `([A-Za-z0-9][A-Za-z0-9&.,'()\\-\\/\\s]{2,180}?${COMPANY_SUFFIX_SOURCE})`,
    "i",
  ));
  if (companyMatch?.[1]) normalized = companyMatch[1].trim();
  if (
    !normalized ||
    normalized.length < 3 ||
    normalized.length > 200 ||
    /^(?:supplier|company|manufacturer)$/i.test(normalized) ||
    PLATFORM_COMPANY_PATTERN.test(normalized)
  ) {
    return null;
  }
  const words = normalized.match(/[A-Za-z0-9]+/g) ?? [];
  return words.length >= 2 ? normalized : null;
}

type SupplierCandidate = {
  value: string;
  score: number;
};

function supplierScore(value: string, baseScore: number) {
  return baseScore +
    (COMPANY_SUFFIX_PATTERN.test(value) ? 30 : 0) +
    Math.min(value.length, 100) / 10;
}

/**
 * Finds the supplier from structured seller/manufacturer data first, then from
 * supplier/company blocks and supplier-homepage links. A final visible-text
 * fallback accepts only company-shaped names with a legal suffix. This covers
 * Made-in-China's real `compnay-name` typo without mistaking marketplace copy
 * or chat controls for a supplier.
 */
export function extractSupplierName(html: string) {
  const candidates = new Map<string, SupplierCandidate>();
  const add = (value: string | null | undefined, baseScore: number) => {
    const cleaned = cleanSupplierName(value ?? null);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    const score = supplierScore(cleaned, baseScore);
    const existing = candidates.get(key);
    if (!existing || score > existing.score) {
      candidates.set(key, { value: cleaned, score });
    }
  };

  add(
    embeddedJsonString(html, [
      "companyName",
      "supplierName",
      "storeName",
      "sellerName",
      "shopName",
      "manufacturerName",
    ]),
    120,
  );

  for (const match of html.matchAll(
    /"(?:seller|manufacturer|supplier)"\s*:\s*\{[\s\S]{0,900}?"name"\s*:\s*"((?:\\.|[^"\\])*)"/gi,
  )) {
    add(match[1], 115);
  }

  add(meta(html, "author"), 105);

  for (const match of html.matchAll(
    /<[^>]+(?:class|id)=["'][^"']*(?:company|compnay|supplier|manufacturer|seller|store)[^"']*["'][^>]*>([\s\S]{0,700}?)<\/[^>]+>/gi,
  )) {
    add(plainText(match[1] ?? ""), 95);
  }

  for (const match of html.matchAll(
    /<a[^>]+href=["'][^"']*(?:\.made-in-china\.com|\/showroom\/|\/company\/)[^"']*["'][^>]*>([\s\S]{0,600}?)<\/a>/gi,
  )) {
    add(plainText(match[1] ?? ""), 85);
  }

  const visibleText = plainText(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "),
  );
  const companyPattern = new RegExp(
    `([A-Z][A-Za-z0-9&.,'()\\-\\/\\s]{2,180}?${COMPANY_SUFFIX_SOURCE})`,
    "g",
  );
  for (const match of visibleText.matchAll(companyPattern)) {
    add(match[1], 55);
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)[0]?.value ?? null;
}

function titleFromSlug(productUrl: string) {
  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const candidate = [...segments].reverse().find((segment) =>
    /[a-z]/i.test(segment) &&
    !/^(product-detail|productdetail|product|pd|p-detail)$/i.test(segment)
  );
  if (!candidate) return null;
  const withoutExtension = candidate
    .replace(/\.html?$/i, "")
    .replace(/[_-]?\d{6,}.*$/i, "")
    .replace(/_[a-z0-9]+$/i, "");
  const words = withoutExtension
    .split(/[-_]+/)
    .map((word) => word.trim())
    .filter((word) => word && !/^\d+$/.test(word));
  if (words.length === 0) return null;
  const lowercaseWords = new Set(["a", "an", "and", "for", "in", "of", "or", "the", "to"]);
  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      if (index > 0 && lowercaseWords.has(normalized)) return normalized;
      return word.length <= 3 && word === word.toUpperCase()
        ? word
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

export type ParserCandidate = {
  field: string;
  value: string;
};

export type ExtractedPriceTier = {
  price: string;
  currency: string | null;
  minQuantity: number;
  maxQuantity: number | null;
};

export type PreviewExtractionSnapshot = {
  blocked: boolean;
  candidates: ParserCandidate[];
  fieldCount: number;
  pageTitle: string | null;
  htmlLength: number;
  detailCounts: {
    priceTiers: number;
    attributes: number;
    variants: number;
    packagingFields: number;
  };
};

export function pageTitleFromHtml(html: string) {
  return regexText(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
}

function firstLargeProductImage(html: string) {
  const imageMatches = [...html.matchAll(/<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)];
  const image = imageMatches
    .map((match) => normalizeUrl(decodeHtml(match[1]) ?? null))
    .find((value) => value && (
      /image\.made-in-china\.com|micstatic\.com|alicdn\.com|sc\d+\.alicdn\.com/i.test(value) ||
      /product|main|large|big|original|photo|image/i.test(value)
    ));
  return image ?? null;
}

function extractIncoterm(bodyText: string) {
  const matches = [...bodyText.matchAll(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/gi)];
  const preferred = matches.find((match) => {
    const after = bodyText.slice(
      (match.index ?? 0) + match[0].length,
      (match.index ?? 0) + match[0].length + 12,
    );
    return !/^\s*price\b/i.test(after);
  });
  return (preferred ?? matches[0])?.[1]?.toUpperCase() ?? null;
}

function quantityNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function positiveNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function tierPrice(value: string | undefined) {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? normalized : null;
}

/**
 * Extracts visible marketplace quantity-price ladders while keeping every
 * unit price attached to its own quantity interval. This prevents combining
 * the cheapest 10,000+ price with the listing's minimum order of 100 pieces.
 */
export function extractPriceTiers(html: string): ExtractedPriceTier[] {
  const bodyText = decodeHtml(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " "),
  ) ?? "";
  const currencyMarker = "(?:US\\s*\\$|US\\$|USD|EUR|GBP|CNY|RMB|\\$|€|£|¥)";
  const quantityToken = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)";
  const unitMarker = "(?:pieces?|pcs?|sets?|units?)";
  const results: ExtractedPriceTier[] = [];

  const forward = new RegExp(
    `(${currencyMarker})\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(?:\\/\\s*(?:piece|pc|set|unit))?\\s*(${quantityToken})\\s*(?:(?:-|–|—)\\s*(${quantityToken})|\\+)\\s*${unitMarker}`,
    "gi",
  );
  for (const match of bodyText.matchAll(forward)) {
    const price = tierPrice(match[2]);
    const minQuantity = quantityNumber(match[3]);
    const maxQuantity = quantityNumber(match[4]);
    if (!price || !minQuantity) continue;
    results.push({
      price,
      currency: normalizeCurrency(match[1] ?? null),
      minQuantity,
      maxQuantity,
    });
  }

  const reverse = new RegExp(
    `(${quantityToken})\\s*(?:(?:-|–|—)\\s*(${quantityToken})|\\+)\\s*${unitMarker}\\s*(${currencyMarker})\\s*([0-9]+(?:[.,][0-9]+)?)`,
    "gi",
  );
  for (const match of bodyText.matchAll(reverse)) {
    const minQuantity = quantityNumber(match[1]);
    const maxQuantity = quantityNumber(match[2]);
    const price = tierPrice(match[4]);
    if (!price || !minQuantity) continue;
    results.push({
      price,
      currency: normalizeCurrency(match[3] ?? null),
      minQuantity,
      maxQuantity,
    });
  }

  const unique = new Map<string, ExtractedPriceTier>();
  for (const tier of results) {
    const key = `${tier.currency ?? ""}:${tier.minQuantity}:${tier.maxQuantity ?? "open"}`;
    if (!unique.has(key)) unique.set(key, tier);
  }
  return [...unique.values()]
    .sort((left, right) => left.minQuantity - right.minQuantity)
    .slice(0, 20);
}

const ATTRIBUTE_NAME_BLOCKLIST = new Set([
  "price",
  "fob price",
  "unit price",
  "minimum order",
  "min order",
  "moq",
  "send inquiry",
  "chat now",
  "product description",
  "company info",
  "contact supplier",
]);

function validAttribute(name: string, value: string) {
  const normalizedName = name.toLowerCase().replace(/\s+/g, " ").trim();
  return Boolean(
    normalizedName &&
    value &&
    normalizedName !== value.toLowerCase() &&
    !ATTRIBUTE_NAME_BLOCKLIST.has(normalizedName) &&
    !/^(home|products?|supplier|english|deutsch)$/i.test(name) &&
    name.length <= 120 &&
    value.length <= 500,
  );
}

export function extractProductAttributes(html: string) {
  const pairs: Array<{ name: string; value: string }> = [];

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((cell) => plainText(cell[1] ?? ""))
      .filter(Boolean);
    if (cells.length < 2) continue;
    const name = cells[0] ?? "";
    const value = cells.slice(1).join(" · ");
    if (validAttribute(name, value)) pairs.push({ name, value });
  }

  for (const item of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const name = plainText(item[1] ?? "");
    const value = plainText(item[2] ?? "");
    if (validAttribute(name, value)) pairs.push({ name, value });
  }

  const unique = new Map<string, { name: string; value: string }>();
  for (const pair of pairs) {
    const key = pair.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || unique.has(key)) continue;
    unique.set(key, pair);
  }
  return [...unique.values()].slice(0, 80);
}

function addVariantValue(
  groups: Map<string, { name: string; values: Set<string> }>,
  name: string | null,
  value: string | null,
) {
  if (!name || !value || name.length > 120 || value.length > 200) return;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!key) return;
  const group = groups.get(key) ?? { name, values: new Set<string>() };
  group.values.add(value);
  groups.set(key, group);
}

export function extractProductVariants(
  html: string,
  attributes: Array<{ name: string; value: string }> = extractProductAttributes(html),
) {
  const groups = new Map<string, { name: string; values: Set<string> }>();

  for (const tagMatch of html.matchAll(/<[^>]+data-(?:attr|attribute|spec|property)-name=["'][^"']+["'][^>]*>/gi)) {
    const tag = tagMatch[0];
    const name = attribute(tag, "data-attr-name") ??
      attribute(tag, "data-attribute-name") ??
      attribute(tag, "data-spec-name") ??
      attribute(tag, "data-property-name");
    const value = attribute(tag, "data-value") ??
      attribute(tag, "data-attr-value") ??
      attribute(tag, "data-option-value") ??
      attribute(tag, "data-spec-value") ??
      attribute(tag, "data-property-value");
    addVariantValue(groups, name, value);
  }

  const jsonPairPattern = /"(?:attrName|attributeName|specName|propertyName)"\s*:\s*"([^"]+)"[\s\S]{0,220}?"(?:attrValue|attributeValue|specValue|propertyValue|valueName)"\s*:\s*"([^"]+)"/gi;
  for (const match of html.matchAll(jsonPairPattern)) {
    addVariantValue(groups, decodeHtml(match[1]), decodeHtml(match[2]));
  }

  const variantNamePattern = /\b(?:color|colour|size|flow|diameter|voltage|power|capacity|length|model|material|type|style)\b/i;
  for (const pair of attributes) {
    if (!variantNamePattern.test(pair.name)) continue;
    const values = pair.value
      .split(/\s*(?:,|;|\||\/)\s*/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 200);
    if (values.length < 2 || values.length > 30) continue;
    for (const value of values) addVariantValue(groups, pair.name, value);
  }

  return [...groups.values()]
    .map((group) => ({ name: group.name, values: [...group.values] }))
    .filter((group) => group.values.length >= 2)
    .slice(0, 20);
}

function findAttribute(
  attributes: Array<{ name: string; value: string }>,
  patterns: RegExp[],
) {
  return attributes.find((attribute) => patterns.some((pattern) => pattern.test(attribute.name)))?.value ?? null;
}

function parsePackageDimensions(value: string | null) {
  if (!value) return null;
  const match = value.match(
    /(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*cm/i,
  );
  if (!match) return null;
  const dimensions = [match[1], match[2], match[3]].map((item) => positiveNumber(item ?? null));
  if (dimensions.some((item) => item === null)) return null;
  return {
    packageLengthCm: dimensions[0]!,
    packageWidthCm: dimensions[1]!,
    packageHeightCm: dimensions[2]!,
  };
}

export function extractProductPackaging(
  html: string,
  attributes: Array<{ name: string; value: string }> = extractProductAttributes(html),
) {
  const bodyText = plainText(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "),
  );
  const sizeText = findAttribute(attributes, [
    /package\s*(?:size|dimension)/i,
    /carton\s*(?:size|dimension)/i,
  ]) ?? bodyText.match(/(?:Package|Carton)\s+(?:Size|Dimension)\s*:?\s*([^;|]{5,100})/i)?.[1] ?? null;
  const dimensions = parsePackageDimensions(sizeText);
  const grossWeightText = findAttribute(attributes, [
    /package\s+gross\s+weight/i,
    /gross\s+weight/i,
  ]) ?? bodyText.match(/(?:Package\s+)?Gross\s+Weight\s*:?\s*(\d+(?:[.,]\d+)?)\s*kg/i)?.[1] ?? null;
  const piecesText = findAttribute(attributes, [
    /pieces?\s+per\s+carton/i,
    /qty\.?\s+per\s+carton/i,
    /packing\s+quantity/i,
  ]) ?? bodyText.match(/(?:Pieces?|Pcs|Qty\.?)\s+(?:Per|\/)\s+Carton\s*:?\s*(\d+)/i)?.[1] ?? null;
  const sellingUnit = findAttribute(attributes, [/selling\s+units?/i]);
  const packageType = findAttribute(attributes, [
    /transport\s+package/i,
    /package\s+type/i,
    /packing\s+type/i,
  ]);
  const grossWeightKg = positiveNumber(grossWeightText);
  const piecesPerCarton = quantityNumber(piecesText ?? undefined);

  if (!dimensions && !grossWeightKg && !piecesPerCarton && !sellingUnit && !packageType) {
    return null;
  }

  return {
    sellingUnit,
    packageType,
    packageLengthCm: dimensions?.packageLengthCm ?? null,
    packageWidthCm: dimensions?.packageWidthCm ?? null,
    packageHeightCm: dimensions?.packageHeightCm ?? null,
    grossWeightKg,
    piecesPerCarton,
  };
}

export function extractMadeInChinaProductDetails(html: string): MarketplaceProductDetails {
  const priceTiers = extractPriceTiers(html);
  const attributes = extractProductAttributes(html);
  const variants = extractProductVariants(html, attributes);
  const packaging = extractProductPackaging(html, attributes);
  return marketplaceProductDetailsSchema.parse({
    adapter: "made-in-china-product-page-v1",
    evidence: "PRODUCT_PAGE",
    priceTiers,
    attributes,
    variants,
    packaging,
  });
}

function detailCounts(details: MarketplaceProductDetails | null) {
  return {
    priceTiers: details?.priceTiers.length ?? 0,
    attributes: details?.attributes.length ?? 0,
    variants: details?.variants.length ?? 0,
    packagingFields: details?.packaging
      ? Object.values(details.packaging).filter((value) => value !== null).length
      : 0,
  };
}

export function inspectPreviewExtraction(html: string, productUrl?: string): PreviewExtractionSnapshot {
  const blocked = isBlockedHtml(html);
  const pageTitle = pageTitleFromHtml(html);
  const bodyText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ");
  const productTitle = cleanTitle(
    embeddedJsonString(html, ["productTitle", "subject", "productName", "seoTitle", "name", "title"]) ??
    meta(html, "og:title") ??
    regexText(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<[^>]+(?:class|id)=["'][^"']*(?:product(?:-|\s)?title|prod(?:-|\s)?title|title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    ]) ??
    pageTitle,
  );
  const supplierName = extractSupplierName(html);
  let details: MarketplaceProductDetails | null = null;
  if (productUrl) {
    try {
      if (detectProvider(new URL(productUrl)) === "made-in-china") {
        details = extractMadeInChinaProductDetails(html);
      }
    } catch {
      details = null;
    }
  }
  const priceTiers = details?.priceTiers ?? extractPriceTiers(html);
  const entryTier = priceTiers[0] ?? null;
  const price = entryTier?.price ??
    embeddedJsonNumber(html, ["price", "minPrice", "salePrice", "offerPrice", "fobPrice", "unitPrice"]) ??
    regexText(html, [
      /"priceRange"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /"fobPrice"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /"priceText"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /US\s*\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /(?:FOB\s+Price|Price|Unit\s+Price)[\s\S]{0,160}?(?:US\s*)?\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /(?:FOB\s+Price|Price|Unit\s+Price)[\s\S]{0,160}?USD\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ])?.replace(",", ".") ??
    null;
  const currency = entryTier?.currency ?? normalizeCurrency(
    embeddedJsonString(html, ["priceCurrency", "currency", "currencyCode", "priceUnit"]) ??
    (/US\s*\$|USD|\$\s*\d/i.test(html) ? "USD" : null),
  );
  const minimumOrderQuantity = entryTier
    ? String(entryTier.minQuantity)
    : embeddedJsonNumber(html, ["moq", "minOrderQuantity", "minimumOrderQuantity", "minOrder", "minOrderNum"]) ??
      bodyText.match(/(?:MOQ|minimum\s+order(?:\s+quantity)?|min\.\s*order)\s*[:\-]?\s*(\d+)/i)?.[1] ??
      bodyText.match(/(\d+)\s*(?:piece|pieces|pcs|set|sets|unit|units)\s*\(?(?:MOQ|Min\.\s*Order|Minimum\s+Order)\)?/i)?.[1] ??
      null;
  const incoterm = extractIncoterm(bodyText);
  const imageUrl = normalizeUrl(
    meta(html, "og:image") ??
    meta(html, "twitter:image") ??
    embeddedJsonString(html, ["imageUrl", "mainImage", "mainImageUrl", "imagePath", "imgUrl", "productImage", "originalImage"]) ??
    firstLargeProductImage(html),
  );
  const values = {
    productTitle,
    supplierName,
    price,
    currency,
    minimumOrderQuantity,
    incoterm,
    imageUrl,
  };
  const candidates = Object.entries(values)
    .filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0
    )
    .map(([field, value]) => ({ field, value }));
  return {
    blocked,
    candidates,
    fieldCount: candidates.length,
    pageTitle,
    htmlLength: new TextEncoder().encode(html).byteLength,
    detailCounts: detailCounts(details),
  };
}

export function parseProductPreview(html: string, productUrl: string): ProductPreview {
  const snapshot = inspectPreviewExtraction(html, productUrl);
  if (snapshot.blocked) throw new Error("BLOCKED");
  const value = (field: string) =>
    snapshot.candidates.find((candidate) => candidate.field === field)?.value ?? null;
  const productTitle = value("productTitle") ?? titleFromSlug(productUrl);
  const supplierName = cleanSupplierName(value("supplierName"));
  const price = value("price");
  const currency = value("currency");
  const minimumOrderQuantity = value("minimumOrderQuantity");
  const incoterm = value("incoterm");
  const imageUrl = value("imageUrl");
  const details = detectProvider(new URL(productUrl)) === "made-in-china"
    ? extractMadeInChinaProductDetails(html)
    : null;

  if (!productTitle && !supplierName && !price && !currency && !minimumOrderQuantity && !imageUrl) {
    throw new Error("PARSING_FAILED");
  }

  return productPreviewSchema.parse({
    productTitle,
    supplierName,
    price,
    currency,
    minimumOrderQuantity,
    incoterm,
    imageUrl,
    productUrl,
    details,
  });
}
