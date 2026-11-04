import type { MarketplacePriceEvidence } from "./marketplace-price-evidence.js";

type ProductIdentity = {
  productUrl: string;
  seller: string;
  sku: string;
  title: string;
  videoUrl: string;
  productHost: string;
};

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, number: string) => {
      const n = Number(number);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    })
    .replace(/\s+/g, " ").trim();
}

function normalizedTitle(value: string) {
  return stripHtml(value)
    .replace(/^What is\s+/i, "")
    .replace(/^China[-\s]+/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export function exactMadeInChinaProductIdentity(productUrl: string): ProductIdentity | null {
  let url: URL;
  try { url = new URL(productUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase();
  const seller = host.match(/^([a-z0-9-]+)\.en\.made-in-china\.com$/)?.[1];
  const parts = url.pathname.match(/^\/product\/([A-Za-z0-9]{8,})\/([^/]+)\.html$/);
  if (!seller || !parts) return null;
  const slug = parts[2].replace(/^China-/i, "");
  const title = normalizedTitle(slug);
  if (!title) return null;
  return {
    productUrl: url.toString(),
    seller,
    sku: parts[1],
    title,
    productHost: host,
    videoUrl: "https://www.made-in-china.com/video-channel/" +
      seller + "_" + parts[1] + "_" + slug + ".html",
  };
}

function productTitleFromProductUrl(productUrl: string) {
  const identity = exactMadeInChinaProductIdentity(productUrl);
  if (!identity) return null;
  return identity.title;
}

function anchors(html: string) {
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])([^"']{1,2000})\1[^>]*>([\s\S]{0,4000}?)<\/a>/gi;
  return [...html.matchAll(pattern)].slice(0, 3000)
    .map(match => ({
      href: match[2],
      title: stripHtml(match[3]),
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
}

/**
 * Only select a seller-hosted category URL discovered on the already validated
 * exact product page. Zero or multiple plausible categories => no fetch.
 * There are never caller-provided or arbitrary browsing target URLs.
 */
export function discoverExactSellerCatalogUrl(productHtml: string, productUrl: string): string | null {
  const identity = exactMadeInChinaProductIdentity(productUrl);
  if (!identity) return null;
  const words = identity.title.split(" ");
  const category = words.slice(-2).join(" ");
  if (!category || category.length < 5) return null;
  const found = new Set<string>();
  for (const anchor of anchors(productHtml)) {
    let url: URL;
    try { url = new URL(anchor.href, productUrl); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password ||
        url.hostname.toLowerCase() !== identity.productHost || url.port ||
        url.search || url.hash) continue;
    if (!/^\/product-group\/[A-Za-z0-9]{6,}\/[A-Za-z0-9-]+\.html$/.test(url.pathname)) continue;
    const pathLabel = url.pathname.split("/").at(-1)?.toLowerCase().replace(/[-_.]+/g, " ") ?? "";
    const label = normalizedTitle(anchor.title);
    if (label === category || pathLabel.includes(category)) found.add(url.toString());
  }
  return found.size === 1 ? [...found][0] : null;
}

function evidenceOfPriceAndMoq(text: string, video: boolean) {
  const marker = video ? "Min. Order Reference FOB Price" : "FOB Price";
  const index = text.toLowerCase().indexOf(marker.toLowerCase());
  if (index === -1) return null;
  const raw = text.slice(index, index + 250);
  const priceMatch = video
    ? raw.match(/Min\.?\s*Order\s+Reference\s+FOB\s+Price\s*:?\s*([\d,]+)\s*(Pieces?|pcs)\s+US\s*\$\s*(\d+(?:\.\d{1,4})?)\s*[-–]\s*(\d+(?:\.\d{1,4})?)\s*\/\s*(Piece|Set|Unit)\b/i)
    : raw.match(/FOB\s+Price\s*:?\s*US\s*\$\s*(\d+(?:\.\d{1,4})?)\s*[-–]\s*(\d+(?:\.\d{1,4})?)\s*\/\s*(Piece|Set|Unit)\s+Min\.?\s*Order\s*:?\s*([\d,]+)\s*(Pieces?|pcs)\b/i);
  if (!priceMatch) return null;
  const pieces = Number((video ? priceMatch[1] : priceMatch[4]).replace(/,/g, ""));
  const lowPrice = video ? priceMatch[3] : priceMatch[1];
  const highPrice = video ? priceMatch[4] : priceMatch[2];
  const unit = video ? priceMatch[5] : priceMatch[3];
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || pieces > 10_000_000 ||
      !(Number(lowPrice) > 0) || !(Number(highPrice) > Number(lowPrice))) return null;
  return {
    lowPrice,
    highPrice,
    currency: "USD",
    unit: unit.toLowerCase() === "piece" ? "Piece" as const :
      unit.toLowerCase() === "set" ? "Set" as const : "Unit" as const,
    minimumOrderQuantity: pieces,
  };
}

/**
 * Scope the video price to its own H1 and primary Min. Order Reference FOB
 * Price section. Never accept price from comparison rows/recommendation cards.
 */
export function parseExactVideoPriceSource(
  html: string, productUrl: string, sourceUrl: string,
): MarketplacePriceEvidence | null {
  const identity = exactMadeInChinaProductIdentity(productUrl);
  if (!identity || sourceUrl !== identity.videoUrl) return null;
  const h1 = html.match(/<h1\b[^>]*>([\s\S]{1,600}?)<\/h1>/i)?.[1];
  if (!h1 || normalizedTitle(h1) !== identity.title) return null;
  const text = stripHtml(html);
  const marker = "Min. Order Reference FOB Price";
  if (text.toLowerCase().split(marker.toLowerCase()).length !== 2) return null;
  const price = evidenceOfPriceAndMoq(text, true);
  if (!price) return null;
  return {
    kind: "VIDEO_CHANNEL",
    sourceUrl,
    productUrl: identity.productUrl,
    productTitle: identity.title,
    supplierSlug: identity.seller,
    ...price,
  };
}

/**
 * Catalog price must appear immediately AFTER an exact-product anchor (SKU
 * URL or matching video link). Never import the next recommended item's price.
 * Ambiguous duplicate price/MOQ matches are rejected.
 */
export function parseExactCatalogPriceSource(
  html: string, productUrl: string, sourceUrl: string,
): MarketplacePriceEvidence | null {
  const identity = exactMadeInChinaProductIdentity(productUrl);
  if (!identity) return null;
  const expectedCatalog = new URL(sourceUrl);
  if (expectedCatalog.protocol !== "https:" ||
      expectedCatalog.hostname.toLowerCase() !== identity.productHost ||
      expectedCatalog.search || expectedCatalog.hash || expectedCatalog.port ||
      !/^\/product-group\/[A-Za-z0-9]{6,}\/[A-Za-z0-9-]+\.html$/.test(expectedCatalog.pathname)) return null;
  const allAnchors = anchors(html);
  const results: MarketplacePriceEvidence[] = [];
  for (const anchor of allAnchors) {
    let href: string;
    try { href = new URL(anchor.href, sourceUrl).toString(); } catch { continue; }
    if ((href !== identity.productUrl && href !== identity.videoUrl) ||
        normalizedTitle(anchor.title) !== identity.title) continue;
    const subsequent = html.slice(anchor.end, anchor.end + 1800);
    const text = stripHtml(subsequent);
    // This is a bounded window, not the entire catalog. Multiple price labels
    // in the window make the source ambiguous rather than conveniently usable.
    if ((text.match(/\bFOB\s+Price\b/gi) ?? []).length !== 1 ||
        (text.match(/\bMin\.?\s*Order\b/gi) ?? []).length !== 1) continue;
    const price = evidenceOfPriceAndMoq(text, false);
    if (!price) continue;
    results.push({
      kind: "SUPPLIER_CATALOG",
      sourceUrl,
      productUrl: identity.productUrl,
      productTitle: identity.title,
      supplierSlug: identity.seller,
      ...price,
    });
  }
  return results.length === 1 ? results[0] : null;
}

export function expectedVideoSourceUrl(productUrl: string) {
  return exactMadeInChinaProductIdentity(productUrl)?.videoUrl ?? null;
}
