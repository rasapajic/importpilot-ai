import {
  reconcileMarketplacePriceEvidence,
  type CorroboratedAdvertisedRange,
} from "./marketplace-price-evidence.js";
import {
  discoverExactSellerCatalogUrl,
  exactMadeInChinaProductIdentity,
  expectedVideoSourceUrl,
  parseExactCatalogPriceSource,
  parseExactVideoPriceSource,
} from "./marketplace-price-source-parser.js";

export type PriceSourceReaderOptions = {
  /**
   * Explicitly opt in: off by default. No existing production route, preview,
   * schedule or background worker calls this reader today.
   */
  enabled?: boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Only when primary MOQ was provably extracted from a generic supplier FAQ. */
  allowSellerFaqCatalogMismatch?: boolean;
};

function trustedEvidenceTarget(
  sourceUrl: string,
  productUrl: string,
  kind: "VIDEO_CHANNEL" | "SUPPLIER_CATALOG",
) {
  const identity = exactMadeInChinaProductIdentity(productUrl);
  if (!identity) return false;
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || url.search || url.hash) return false;
  if (kind === "VIDEO_CHANNEL") {
    return url.hostname === "www.made-in-china.com" &&
      url.toString() === identity.videoUrl;
  }
  return url.hostname === identity.productHost &&
    /^\/product-group\/[A-Za-z0-9]{6,}\/[A-Za-z0-9-]+\.html$/.test(url.pathname);
}

async function readLimitedSourcePage(
  sourceUrl: string,
  productUrl: string,
  kind: "VIDEO_CHANNEL" | "SUPPLIER_CATALOG",
  options: PriceSourceReaderOptions,
): Promise<string | null> {
  if (!trustedEvidenceTarget(sourceUrl, productUrl, kind)) return null;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = Math.min(8_000, Math.max(1_000, options.timeoutMs ?? 4_000));
  const byteLimit = Math.min(400_000, Math.max(20_000, options.maxResponseBytes ?? 300_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(sourceUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; JAKOV360/0.3; read-only source validation)",
      },
    });
    if (!response.ok || response.status !== 200 || response.redirected ||
        (response.status >= 300 && response.status < 400)) return null;

    // The real fetch Response carries the final network URL. Mock Response
    // objects may leave it blank, only allowed with an injected test fetcher.
    let exactResponse = false;
    try {
      if (response.url) {
        const finalUrl = new URL(response.url);
        exactResponse = finalUrl.protocol === "https:" &&
          !finalUrl.username && !finalUrl.password &&
          !finalUrl.hash && !finalUrl.search && !finalUrl.port &&
          finalUrl.toString() === sourceUrl;
      } else if (options.fetcher) {
        exactResponse = true;
      }
    } catch { exactResponse = false; }
    if (!exactResponse) return null;

    const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/.test(mediaType)) return null;
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > byteLimit)) return null;
    if (!response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > byteLimit) {
          await reader.cancel();
          return null;
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return html.length > 0 ? html : null;
  } catch {
    // Optional evidence must not break a valid primary product preview.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A single controlled, read-only corroboration attempt. The already fetched,
 * exact-product HTML is used ONLY for discovering a same-seller category URL.
 * Two independently fetched, nonredirected marketplace pages are parsed
 * in isolation and reconciled; NO arbitrary URLs are accepted as inputs.
 *
 * Intentionally NOT wired into active /preview. Nothing here authorizes sending
 * RFQs, writing to the DB, or converting an advertised range to a quote.
 */
export async function readCorroboratedMarketplacePrice(
  productUrl: string,
  verifiedProductHtml: string,
  options: PriceSourceReaderOptions = {},
): Promise<CorroboratedAdvertisedRange | null> {
  if (options.enabled !== true) return null;
  const identity = exactMadeInChinaProductIdentity(productUrl);
  const video = expectedVideoSourceUrl(productUrl);
  if (!identity || !video || verifiedProductHtml.length > 1_000_000) return null;
  const catalog = discoverExactSellerCatalogUrl(verifiedProductHtml, productUrl);
  if (!catalog) return null;

  const videoHtml = await readLimitedSourcePage(
    video, productUrl, "VIDEO_CHANNEL", options,
  );
  if (!videoHtml) return null;
  const videoEvidence = parseExactVideoPriceSource(videoHtml, productUrl, video);
  if (!videoEvidence) return null;

  const catalogHtml = await readLimitedSourcePage(
    catalog, productUrl, "SUPPLIER_CATALOG", options,
  );
  if (!catalogHtml) return null;
  const catalogEvidence = parseExactCatalogPriceSource(
    catalogHtml, productUrl, catalog,
  );
  if (!catalogEvidence) return null;

  return reconcileMarketplacePriceEvidence(productUrl, [
    videoEvidence,
    catalogEvidence,
  ]);
}


/**
 * A strictly lower-confidence alternative for public price discovery when
 * the video site blocks automated reads. This is ONE seller-controlled catalog
 * page, NOT independent corroboration, never a firm quote or landed-cost price.
 * Callers must supply the MOQ already parsed from the exact primary product.
 */
export type SingleCatalogAdvertisedRange = {
  kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE";
  sourceUrl: string;
  productUrl: string;
  lowPrice: string;
  highPrice: string;
  currency: string;
  unit: "Piece" | "Set" | "Unit";
  minimumOrderQuantity: number;
  corroborated: false;
  verifiedQuote: false;
};

export async function readSingleCatalogAdvertisedRange(
  productUrl: string,
  verifiedProductHtml: string,
  primaryProductMoq: number,
  options: PriceSourceReaderOptions = {},
): Promise<SingleCatalogAdvertisedRange | null> {
  if (options.enabled !== true || !Number.isSafeInteger(primaryProductMoq) ||
      primaryProductMoq <= 0 || verifiedProductHtml.length > 1_000_000 ||
      !exactMadeInChinaProductIdentity(productUrl)) return null;

  const catalog = discoverExactSellerCatalogUrl(verifiedProductHtml, productUrl);
  if (!catalog) return null;
  const html = await readLimitedSourcePage(
    catalog, productUrl, "SUPPLIER_CATALOG", options,
  );
  if (!html) return null;
  const evidence = parseExactCatalogPriceSource(html, productUrl, catalog);
  if (!evidence || evidence.minimumOrderQuantity !== primaryProductMoq) return null;

  return {
    kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE",
    sourceUrl: evidence.sourceUrl,
    productUrl: evidence.productUrl,
    lowPrice: evidence.lowPrice,
    highPrice: evidence.highPrice,
    currency: evidence.currency,
    unit: evidence.unit,
    minimumOrderQuantity: evidence.minimumOrderQuantity,
    corroborated: false,
    verifiedQuote: false,
  };
}


/**
 * One exact-SKU catalog card contradicts the supplier-wide FAQ on the primary
 * page. The values remain independently attributed; neither is a firm MOQ or
 * a price that may be used by landed-cost, tier selection or RFQ automation.
 */
export type SellerCatalogFaqMoqConflict = {
  kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT";
  productUrl: string;
  sourceUrl: string;
  faqMinimumOrderQuantity: number;
  catalogMinimumOrderQuantity: number;
  lowPrice: string;
  highPrice: string;
  currency: string;
  unit: "Piece" | "Set" | "Unit";
  corroborated: false;
  verifiedQuote: false;
  landedCostEligible: false;
};

/**
 * Preview-bridge helper: one trusted catalog GET plus at most one same-SKU
 * video GET. If the video denies access (HTTP 403) this yields catalog-only
 * public evidence, never a fabricated two-source confirmation.
 *
 * Enabled explicitly by the caller, and disabled in the running service
 * unless the operator turns on the separate server-side feature flag.
 * No writes, no retries, no arbitrary target URLs.
 */
export async function readMarketplacePublicPriceEvidence(
  productUrl: string,
  verifiedProductHtml: string,
  primaryProductMoq: number,
  options: PriceSourceReaderOptions = {},
): Promise<CorroboratedAdvertisedRange | SingleCatalogAdvertisedRange | SellerCatalogFaqMoqConflict | null> {
  if (options.enabled !== true || !Number.isSafeInteger(primaryProductMoq) ||
      primaryProductMoq <= 0 || verifiedProductHtml.length > 1_000_000 ||
      !exactMadeInChinaProductIdentity(productUrl)) return null;

  const catalogUrl = discoverExactSellerCatalogUrl(verifiedProductHtml, productUrl);
  if (!catalogUrl) return null;
  const catalogHtml = await readLimitedSourcePage(
    catalogUrl, productUrl, "SUPPLIER_CATALOG", options,
  );
  if (!catalogHtml) return null;
  const catalog = parseExactCatalogPriceSource(catalogHtml, productUrl, catalogUrl);
  if (!catalog) return null;
  if (catalog.minimumOrderQuantity !== primaryProductMoq) {
    if (options.allowSellerFaqCatalogMismatch !== true) return null;
    return {
      kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
      productUrl: catalog.productUrl,
      sourceUrl: catalog.sourceUrl,
      faqMinimumOrderQuantity: primaryProductMoq,
      catalogMinimumOrderQuantity: catalog.minimumOrderQuantity,
      lowPrice: catalog.lowPrice,
      highPrice: catalog.highPrice,
      currency: catalog.currency,
      unit: catalog.unit,
      corroborated: false,
      verifiedQuote: false,
      landedCostEligible: false,
    };
  }

  const catalogOnly: SingleCatalogAdvertisedRange = {
    kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE",
    sourceUrl: catalog.sourceUrl,
    productUrl: catalog.productUrl,
    lowPrice: catalog.lowPrice,
    highPrice: catalog.highPrice,
    currency: catalog.currency,
    unit: catalog.unit,
    minimumOrderQuantity: catalog.minimumOrderQuantity,
    corroborated: false,
    verifiedQuote: false,
  };

  const videoUrl = expectedVideoSourceUrl(productUrl);
  if (!videoUrl) return catalogOnly;
  const videoHtml = await readLimitedSourcePage(
    videoUrl, productUrl, "VIDEO_CHANNEL", options,
  );
  if (!videoHtml) return catalogOnly; // e.g., real video page HTTP 403
  const video = parseExactVideoPriceSource(videoHtml, productUrl, videoUrl);
  if (!video) return catalogOnly;

  return reconcileMarketplacePriceEvidence(productUrl, [video, catalog]) ?? catalogOnly;
}
