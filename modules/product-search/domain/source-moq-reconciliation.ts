import type { SupplierOfferSearchResult, SupplierOfferUrlPreview } from "./search";

/**
 * Compare the exact product-page identity. Supplier names and similar titles
 * must never count as a match. Query parameters are intentionally retained:
 * some marketplaces use them to identify a variant.
 */
export function exactProductPageIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export type SourceMoqEvidence = {
  status: "MATCHED" | "DIFFERENT" | "NOT_VERIFIED" | "URL_MISMATCH";
  cachedMoq: number | null;
  pageMoq: number | null;
  checkedAt: string | null;
  productUrl: string;
};

/**
 * Evidence is session-only. A parser fallback, partial preview, a different SKU,
 * or an inaccessible page must never rewrite a cached MOQ or imply verification.
 */
export function reconcileSourceMoq(
  result: Pick<SupplierOfferSearchResult, "productUrl" | "minimumOrderQuantity">,
  preview: Pick<SupplierOfferUrlPreview, "productUrl" | "minimumOrderQuantity" | "isPartial" | "titleFromSlug"> | null,
  checkedAt: string | null,
): SourceMoqEvidence {
  const base = {
    cachedMoq: result.minimumOrderQuantity,
    pageMoq: null,
    checkedAt: null,
    productUrl: result.productUrl,
  };
  if (!preview) return { ...base, status: "NOT_VERIFIED" };
  const resultIdentity = exactProductPageIdentity(result.productUrl);
  const previewIdentity = exactProductPageIdentity(preview.productUrl);
  if (!resultIdentity || resultIdentity !== previewIdentity) {
    return { ...base, status: "URL_MISMATCH" };
  }
  if (
    preview.isPartial || preview.titleFromSlug ||
    !Number.isSafeInteger(preview.minimumOrderQuantity) ||
    Number(preview.minimumOrderQuantity) <= 0 ||
    !checkedAt || !Number.isFinite(Date.parse(checkedAt))
  ) {
    return { ...base, status: "NOT_VERIFIED" };
  }
  const pageMoq = Number(preview.minimumOrderQuantity);
  return {
    ...base,
    status: result.minimumOrderQuantity === pageMoq ? "MATCHED" : "DIFFERENT",
    pageMoq,
    checkedAt,
  };
}

/** Only an actual, exact-page reading may change a transient result's MOQ. */
export function resultWithSourceMoq(
  result: SupplierOfferSearchResult,
  evidence: SourceMoqEvidence | undefined,
): SupplierOfferSearchResult {
  if (!evidence || (evidence.status !== "MATCHED" && evidence.status !== "DIFFERENT")) return result;
  if (
    exactProductPageIdentity(evidence.productUrl) !== exactProductPageIdentity(result.productUrl) ||
    evidence.pageMoq === null
  ) return result;
  if (evidence.status === "MATCHED") return result;
  return {
    ...result,
    minimumOrderQuantity: evidence.pageMoq,
    // Cached price tiers are not evidence that a source-page MOQ mismatch
    // is resolved for the buyer's quantity. Keep the raw advertised price.
    marketplaceDetails: null,
    priceEvidence: "MARKETPLACE_SEARCH",
  };
}
