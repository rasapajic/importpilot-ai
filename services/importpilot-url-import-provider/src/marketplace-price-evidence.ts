/**
 * JAKOV360 #199: evidence reconciliation only. No network I/O.
 *
 * A scanner may supply independently parsed exact-product evidence from
 * official marketplace pages. This function refuses to combine related
 * products, different variants, mismatched minimums or supplier identities.
 * The return value is an advertised range, never a supplier-issued quote.
 */
export type MarketplacePriceEvidence = {
  kind: "VIDEO_CHANNEL" | "SUPPLIER_CATALOG";
  sourceUrl: string;
  productUrl: string;
  productTitle: string;
  supplierSlug: string;
  lowPrice: string;
  highPrice: string;
  currency: string;
  unit: "Piece" | "Set" | "Unit";
  minimumOrderQuantity: number;
};

export type CorroboratedAdvertisedRange = {
  kind: "CORROBORATED_ADVERTISED_RANGE";
  productUrl: string;
  lowPrice: string;
  highPrice: string;
  currency: string;
  unit: "Piece" | "Set" | "Unit";
  minimumOrderQuantity: number;
  evidence: readonly [string, string];
  verifiedQuote: false;
};

function secureUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.port) return null;
    return url;
  } catch { return null; }
}

function sellerAndSku(productUrl: string) {
  const url = secureUrl(productUrl);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const matchHost = host.match(/^([a-z0-9-]+)\.en\.made-in-china\.com$/);
  const matchPath = url.pathname.match(/^\/product\/([A-Za-z0-9]+)\/([^/]+)\.html$/);
  if (!matchHost || !matchPath || matchPath[1].length < 8) return null;
  return {
    host,
    seller: matchHost[1],
    sku: matchPath[1],
    title: normalizedTitle(matchPath[2].replace(/^China-/i, "")),
    url: url.toString(),
  };
}

function normalizedTitle(title: string) {
  return title
    .replace(/^What is\s+/i, "")
    .replace(/^China[-\s]+/i, "")
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase().trim();
}

function positivePrice(price: string) {
  if (!/^\d+(?:\.\d{1,4})?$/.test(price)) return null;
  const value = Number(price);
  return Number.isFinite(value) && value > 0 && value < 1_000_000
    ? value : null;
}

/**
 * Each source must already be extracted from its own page. We validate its
 * exact identity and reconcile independently attested price/MOQ values here.
 * Do not use this function on arbitrary snippets without source provenance.
 */
export function reconcileMarketplacePriceEvidence(
  productUrl: string,
  candidates: readonly MarketplacePriceEvidence[],
): CorroboratedAdvertisedRange | null {
  const product = sellerAndSku(productUrl);
  if (!product || candidates.length !== 2) return null;
  const video = candidates.find(c => c.kind === "VIDEO_CHANNEL");
  const catalog = candidates.find(c => c.kind === "SUPPLIER_CATALOG");
  if (!video || !catalog || video === catalog) return null;

  for (const item of [video, catalog]) {
    const src = secureUrl(item.sourceUrl);
    if (!src || item.supplierSlug !== product.seller ||
        item.productUrl !== product.url ||
        normalizedTitle(item.productTitle) !== product.title ||
        item.currency !== "USD" && !/^[A-Z]{3}$/.test(item.currency) ||
        !Number.isSafeInteger(item.minimumOrderQuantity) ||
        item.minimumOrderQuantity < 1 ||
        positivePrice(item.lowPrice) === null ||
        positivePrice(item.highPrice) === null ||
        Number(item.highPrice) <= Number(item.lowPrice)) return null;

    if (item.kind === "VIDEO_CHANNEL") {
      if (src.hostname !== "www.made-in-china.com" ||
          !src.pathname.startsWith("/video-channel/") ||
          !src.pathname.includes("_" + product.sku + "_") ||
          !src.pathname.startsWith("/video-channel/" + product.seller + "_")) return null;
    } else {
      if (src.hostname !== product.host ||
          !/^\/product-group\/[a-zA-Z0-9]+\/[^/]+\.html$/.test(src.pathname)) return null;
    }
  }
  if (video.sourceUrl === catalog.sourceUrl ||
      video.lowPrice !== catalog.lowPrice ||
      video.highPrice !== catalog.highPrice ||
      video.currency !== catalog.currency ||
      video.unit !== catalog.unit ||
      video.minimumOrderQuantity !== catalog.minimumOrderQuantity) return null;

  return {
    kind: "CORROBORATED_ADVERTISED_RANGE",
    productUrl: product.url,
    lowPrice: video.lowPrice,
    highPrice: video.highPrice,
    currency: video.currency,
    unit: video.unit,
    minimumOrderQuantity: video.minimumOrderQuantity,
    evidence: [video.sourceUrl, catalog.sourceUrl],
    verifiedQuote: false,
  };
}
