import { advertisedPriceRangeSchema } from "./contract.js";

/**
 * Optional, bounded corroboration source. The URL is never supplied by a
 * client: it is deterministically derived from an already validated exact
 * Made-in-China product URL, and its host is fixed.
 */
export function videoChannelUrlForProduct(productUrl: string): string | null {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.port) return null;
    const host = url.hostname.match(/^([a-z0-9-]{2,48})\.en\.made-in-china\.com$/i);
    const path = url.pathname.match(/^\/product\/([A-Za-z0-9]{8,32})\/China-([A-Za-z0-9][A-Za-z0-9-]{5,230})\.html$/i);
    if (!host || !path) return null;
    const seller = host[1].toLowerCase();
    const sku = path[1];
    const slug = path[2];
    return "https://www.made-in-china.com/video-channel/" +
      seller + "_" + sku + "_" + slug + ".html";
  } catch {
    return null;
  }
}

function textFromHtml(input: string) {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalExactUrl(value: string) {
  try {
    const u = new URL(value.replace(/&amp;/gi, "&"));
    if (u.protocol !== "https:" || u.username || u.password || u.hash) return null;
    return u.href;
  } catch {
    return null;
  }
}
function normalizedTitle(value: string) {
  return value.toLowerCase()
    .replace(/^(?:what is|china)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A verified video channel can establish a public range for one exact SKU
 * only when it links back to that product, names the exact product and
 * declares an explicit MOQ + FOB range in its own Price section.
 * Result is NOT a firm quote or a quantity-dependent price.
 */
export function extractVideoChannelAdvertisedPriceRange(
  html: string,
  productUrl: string,
  videoUrl: string,
  expectedMoq: string | null,
  advertisedLow: string | null,
) {
  const derivedVideoUrl = videoChannelUrlForProduct(productUrl);
  if (!derivedVideoUrl || canonicalExactUrl(videoUrl) !== derivedVideoUrl ||
      html.length > 350_000 || html.length < 100) return null;
  const expectedSku = new URL(productUrl).pathname.match(/^\/product\/([A-Za-z0-9]{8,32})\//)?.[1];
  if (!expectedSku) return null;
  const expectedTitle = normalizedTitle(
    new URL(productUrl).pathname.split("/").at(-1)?.replace(/\.html$/i, "") ?? "",
  );
  if (expectedTitle.length < 25) return null;
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]{0,500}?)<\/h1>/gi)].map(x =>
    normalizedTitle(textFromHtml(x[1]))
  );
  if (!headings.includes(expectedTitle)) return null;

  // Anchor must point to the exact product page, not a sibling SKU.
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']{1,2000})["'][^>]*>/gi)];
  const canonicalProductUrl = canonicalExactUrl(productUrl);
  if (!canonicalProductUrl || !links.some(x =>
    canonicalExactUrl(x[1]) === canonicalProductUrl
  )) return null;

  const plain = textFromHtml(html);
  const match = plain.match(
    /\bMin\.?\s*Order\s+Reference\s+FOB\s+Price\s+(?:[:\-]\s*)?([0-9]{1,3}(?:,\d{3})+|\d+)\s*(?:Pieces?|Pcs?|Units?)\s+US\s*\$\s*(\d+(?:\.\d{1,4})?)\s*[-–—]\s*(\d+(?:\.\d{1,4})?)\s*\/\s*(?:Piece|Pc|Unit)\b/i
  );
  if (!match) return null;
  const moq = Number(match[1].replace(/,/g, ""));
  const low = Number(match[2]);
  if (!Number.isSafeInteger(moq) || moq < 1 ||
      expectedMoq === null || Number(expectedMoq) !== moq ||
      advertisedLow === null || Number(advertisedLow) !== low) return null;
  const result = advertisedPriceRangeSchema.safeParse({
    lowPrice: match[2],
    highPrice: match[3],
    currency: "USD",
    unit: "Piece",
    evidence: "MATCHED_VIDEO_CHANNEL",
    sourceUrl: productUrl,
    evidenceUrl: videoUrl,
  });
  return result.success ? result.data : null;
}
