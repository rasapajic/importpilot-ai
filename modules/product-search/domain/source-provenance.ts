import { isPartialLunaSearchResult } from "./luna-search-plan";
import {
  supplierOfferUrlPreviewSchema,
  type SupplierOfferSearchProvenance,
  type SupplierOfferSearchResult,
  type SupplierOfferUrlPreview,
} from "./search";

export function is1688Url(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "1688.com" || host.endsWith(".1688.com"));
  } catch {
    return false;
  }
}

export function createBrowserAssisted1688Preview(productUrl: string): SupplierOfferUrlPreview | null {
  if (!is1688Url(productUrl)) return null;
  const url = new URL(productUrl);
  return supplierOfferUrlPreviewSchema.parse({
    title: null,
    supplierName: null,
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl: url.toString(),
    imageUrl: null,
    source: url.hostname.toLowerCase(),
    isPartial: true,
    titleFromSlug: false,
  });
}

function fallbackProvenance(
  result: SupplierOfferSearchResult,
  fetchedAt: string,
): SupplierOfferSearchProvenance {
  return {
    fetchedAt,
    resultOrigin: is1688Url(result.productUrl) ? "browser-assisted-1688" : "url-import",
    originalQuery: null,
    providerQuery: null,
    chinese1688Query: null,
    targetCountry: null,
    quantity: null,
  };
}

export function createSupplierOfferSourceMetadata(
  result: SupplierOfferSearchResult,
  now: Date = new Date(),
) {
  const url = new URL(result.productUrl);
  const provenance = result.provenance ?? fallbackProvenance(result, now.toISOString());
  const captureMode = provenance.resultOrigin === "browser-assisted-1688"
    ? "BROWSER_ASSISTED_1688"
    : provenance.resultOrigin === "live" || provenance.resultOrigin === "cache"
      ? "LUNA_SEARCH"
      : "URL_IMPORT";

  return {
    title: result.title,
    productUrl: result.productUrl,
    sourceUrl: result.productUrl,
    sourceHost: url.hostname.toLowerCase(),
    imageUrl: result.imageUrl,
    providerSource: result.source,
    fetchedAt: provenance.fetchedAt,
    resultOrigin: provenance.resultOrigin,
    captureMode,
    dataStatus: isPartialLunaSearchResult(result) ? "PARTIAL" : "COMPLETE",
    provenance,
  };
}
