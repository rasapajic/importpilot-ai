import { productPreviewSchema, type ProductPreview } from "./contract.js";

export function detectProvider(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === "alibaba.com" || host.endsWith(".alibaba.com")) return "alibaba";
  if (host === "made-in-china.com" || host.endsWith(".made-in-china.com")) return "made-in-china";
  return "unknown";
}

export function hasProductIdentifier(url: URL) {
  const value = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  const provider = detectProvider(url);
  if (provider === "alibaba") return /product-detail|product\/|_\d+\.html|\/p-detail\//.test(value) || url.hostname.toLowerCase().startsWith("s.");
  if (provider === "made-in-china") return /\/product\/|\/productdetail\/|\/product-detail\/|_[a-z0-9]+\.html|\/pd\//i.test(value);
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
    .replace(/\s+/g, " ")
    .trim() || null;
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
  if (normalized === "$" || normalized.includes("US $") || normalized.includes("USD")) return "USD";
  if (normalized === "€" || normalized.includes("EUR")) return "EUR";
  if (normalized.includes("GBP") || normalized.includes("£")) return "GBP";
  if (normalized.includes("CNY") || normalized.includes("¥")) return "CNY";
  return normalized.match(/\b[A-Z]{3}\b/)?.[0] ?? null;
}

function normalizeUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

export type ParserCandidate = {
  field: string;
  value: string;
};

export type PreviewExtractionSnapshot = {
  blocked: boolean;
  candidates: ParserCandidate[];
  fieldCount: number;
  pageTitle: string | null;
  htmlLength: number;
};

export function pageTitleFromHtml(html: string) {
  return regexText(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
}

function firstLargeProductImage(html: string) {
  const imageMatches = [...html.matchAll(/<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi)];
  const image = imageMatches
    .map((match) => normalizeUrl(decodeHtml(match[1]) ?? null))
    .find((value) => value && (
      /image\.made-in-china\.com|micstatic\.com|alicdn\.com|sc\d+\.alicdn\.com/i.test(value)
      || /product|main|large|big|original|photo|image/i.test(value)
    ));
  return image ?? null;
}

export function inspectPreviewExtraction(html: string): PreviewExtractionSnapshot {
  const blocked = isBlockedHtml(html);
  const pageTitle = pageTitleFromHtml(html);
  const bodyText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ");
  const productTitle = embeddedJsonString(html, ["productTitle", "subject", "productName", "seoTitle", "name", "title"])
    ?? meta(html, "og:title")
    ?? regexText(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<[^>]+(?:class|id)=["'][^"']*(?:product(?:-|\s)?title|prod(?:-|\s)?title|title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    ])
    ?? pageTitle;
  const supplierName = embeddedJsonString(html, ["companyName", "supplierName", "storeName", "sellerName", "shopName"])
    ?? meta(html, "author")
    ?? regexText(html, [
      /(?:Company\s+Name|Supplier|Manufacturer)\s*:?<\/?[^>]*>\s*([^<\n]+)/i,
      /(?:Company\s+Name|Supplier|Manufacturer)\s*[:\-]\s*([^<\n]+)/i,
      /<[^>]+(?:class|id)=["'][^"']*(?:company|supplier|manufacturer)[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
      /<a[^>]+href=["'][^"']*\.made-in-china\.com["'][^>]*>([\s\S]*?(?:Co\.|Ltd\.|Limited|Factory|Supplier)[\s\S]*?)<\/a>/i,
    ]);
  const price = embeddedJsonNumber(html, ["price", "minPrice", "salePrice", "offerPrice", "fobPrice", "unitPrice"])
    ?? regexText(html, [
      /"priceRange"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /"fobPrice"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /"priceText"\s*:\s*"[^0-9"]*([0-9]+(?:[.,][0-9]+)?)/i,
      /US\s*\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /(?:FOB\s+Price|Price|Unit\s+Price)[\s\S]{0,160}?(?:US\s*)?\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /(?:FOB\s+Price|Price|Unit\s+Price)[\s\S]{0,160}?USD\s*([0-9]+(?:[.,][0-9]+)?)/i,
      /\$\s*([0-9]+(?:[.,][0-9]+)?)/i,
    ])?.replace(",", ".") ?? null;
  const currency = normalizeCurrency(embeddedJsonString(html, ["priceCurrency", "currency", "currencyCode", "priceUnit"])
    ?? (/US\s*\$|USD|\$\s*\d/i.test(html) ? "USD" : null));
  const minimumOrderQuantity = embeddedJsonNumber(html, ["moq", "minOrderQuantity", "minimumOrderQuantity", "minOrder", "minOrderNum"])
    ?? (bodyText.match(/(?:MOQ|minimum\s+order(?:\s+quantity)?|min\.\s*order)\s*[:\-]?\s*(\d+)/i)?.[1]
      ?? bodyText.match(/(\d+)\s*(?:piece|pieces|pcs|set|sets|unit|units)\s*\(?(?:MOQ|Min\.\s*Order|Minimum\s+Order)\)?/i)?.[1]
      ?? null);
  const incoterm = bodyText.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i)?.[1]?.toUpperCase() ?? null;
  const imageUrl = normalizeUrl(meta(html, "og:image")
    ?? meta(html, "twitter:image")
    ?? embeddedJsonString(html, ["imageUrl", "mainImage", "mainImageUrl", "imagePath", "imgUrl", "productImage", "originalImage"])
    ?? firstLargeProductImage(html));
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
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([field, value]) => ({ field, value }));
  return {
    blocked,
    candidates,
    fieldCount: candidates.length,
    pageTitle,
    htmlLength: new TextEncoder().encode(html).byteLength,
  };
}

export function parseProductPreview(html: string, productUrl: string): ProductPreview {
  const snapshot = inspectPreviewExtraction(html);
  if (snapshot.blocked) throw new Error("BLOCKED");
  const value = (field: string) => snapshot.candidates.find((candidate) => candidate.field === field)?.value ?? null;
  const productTitle = value("productTitle");
  const supplierName = value("supplierName");
  const price = value("price");
  const currency = value("currency");
  const minimumOrderQuantity = value("minimumOrderQuantity");
  const incoterm = value("incoterm");
  const imageUrl = value("imageUrl");

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
  });
}
