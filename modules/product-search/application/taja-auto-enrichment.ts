import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlImportProvider,
  SupplierOfferUrlPreview,
} from "../domain/search";
import { canonicalSupplierProductUrl } from "../domain/supplier-product-url";
import { detectUrlImportProvider } from "../infrastructure/url-import-provider";

export const TajaAutoEnrichmentStatuses = {
  ENRICHED: "ENRICHED",
  UNCHANGED: "UNCHANGED",
  SKIPPED_UNSUPPORTED: "SKIPPED_UNSUPPORTED",
  SKIPPED_LIMIT: "SKIPPED_LIMIT",
  FAILED: "FAILED",
} as const;

export type TajaAutoEnrichmentStatus =
  (typeof TajaAutoEnrichmentStatuses)[keyof typeof TajaAutoEnrichmentStatuses];

export type TajaAutoEnrichmentField =
  | "supplierCountry"
  | "price"
  | "minimumOrderQuantity"
  | "incoterm"
  | "imageUrl";

export type TajaAutoEnrichmentReport = {
  productUrl: string;
  status: TajaAutoEnrichmentStatus;
  fieldsFilled: TajaAutoEnrichmentField[];
  fieldsCorrected: TajaAutoEnrichmentField[];
  failureCode?: string;
};

export type TajaAutoEnrichmentSummary = {
  requestedCandidates: number;
  attemptedCandidates: number;
  enrichedCandidates: number;
  correctedCandidates: number;
  unchangedCandidates: number;
  failedCandidates: number;
  skippedUnsupportedCandidates: number;
  skippedByLimitCandidates: number;
  reports: TajaAutoEnrichmentReport[];
};

type AutoEnrichmentOptions = {
  maxCandidates?: number;
  concurrency?: number;
};

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value!)));
}

function isSupportedProductUrl(productUrl: string) {
  try {
    return detectUrlImportProvider(new URL(productUrl)) !== "unknown";
  } catch {
    return false;
  }
}

function sameProductUrl(left: string, right: string) {
  return canonicalSupplierProductUrl(left) === canonicalSupplierProductUrl(right);
}

function isAuthoritativePreview(
  result: SupplierOfferSearchResult,
  preview: SupplierOfferUrlPreview,
) {
  return !preview.isPartial &&
    !preview.titleFromSlug &&
    sameProductUrl(result.productUrl, preview.productUrl);
}

function changedNumber(left: number | null, right: number | null) {
  return left !== null && right !== null && Math.abs(left - right) > 0.0001;
}

function mergePreview(
  result: SupplierOfferSearchResult,
  preview: SupplierOfferUrlPreview,
) {
  const fieldsFilled: TajaAutoEnrichmentField[] = [];
  const fieldsCorrected: TajaAutoEnrichmentField[] = [];
  const authoritative = isAuthoritativePreview(result, preview);

  let price = result.price;
  let currency = result.currency;
  if (preview.price !== null && preview.currency !== null) {
    if (price === null && currency === null) {
      price = preview.price;
      currency = preview.currency;
      fieldsFilled.push("price");
    } else if (
      authoritative &&
      (
        changedNumber(price, preview.price) ||
        currency !== preview.currency
      )
    ) {
      price = preview.price;
      currency = preview.currency;
      fieldsCorrected.push("price");
    }
  }

  let supplierCountry = result.supplierCountry;
  if (preview.supplierCountry !== null) {
    if (supplierCountry === null) {
      supplierCountry = preview.supplierCountry;
      fieldsFilled.push("supplierCountry");
    } else if (authoritative && supplierCountry !== preview.supplierCountry) {
      supplierCountry = preview.supplierCountry;
      fieldsCorrected.push("supplierCountry");
    }
  }

  let minimumOrderQuantity = result.minimumOrderQuantity;
  if (preview.minimumOrderQuantity !== null) {
    if (minimumOrderQuantity === null) {
      minimumOrderQuantity = preview.minimumOrderQuantity;
      fieldsFilled.push("minimumOrderQuantity");
    } else if (
      authoritative &&
      minimumOrderQuantity !== preview.minimumOrderQuantity
    ) {
      minimumOrderQuantity = preview.minimumOrderQuantity;
      fieldsCorrected.push("minimumOrderQuantity");
    }
  }

  let incoterm = result.incoterm;
  if (preview.incoterm !== null) {
    if (incoterm === null) {
      incoterm = preview.incoterm;
      fieldsFilled.push("incoterm");
    } else if (authoritative && incoterm !== preview.incoterm) {
      incoterm = preview.incoterm;
      fieldsCorrected.push("incoterm");
    }
  }

  let imageUrl = result.imageUrl;
  if (preview.imageUrl !== null) {
    if (imageUrl === null) {
      imageUrl = preview.imageUrl;
      fieldsFilled.push("imageUrl");
    } else if (authoritative && imageUrl !== preview.imageUrl) {
      imageUrl = preview.imageUrl;
      fieldsCorrected.push("imageUrl");
    }
  }

  return {
    result: {
      ...result,
      supplierCountry,
      price,
      currency,
      minimumOrderQuantity,
      incoterm,
      imageUrl,
    } satisfies SupplierOfferSearchResult,
    fieldsFilled,
    fieldsCorrected,
  };
}

function failureCode(error: unknown) {
  if (error instanceof Error && error.constructor.name) return error.constructor.name.slice(0, 100);
  return "UnknownAutoEnrichmentError";
}

/**
 * Verifies a bounded set of finalists against their exact marketplace pages.
 * A non-partial preview tied to the same canonical product URL is stronger than
 * search snippets or cached discovery data and may correct conflicting price,
 * MOQ, country, Incoterm or image fields. Partial previews remain fill-only.
 * Failures are isolated per candidate and no raw upstream error text is sent
 * to the browser.
 */
export async function autoEnrichTajaCandidates(
  results: SupplierOfferSearchResult[],
  provider: SupplierOfferUrlImportProvider,
  options: AutoEnrichmentOptions = {},
) {
  const maxCandidates = boundedInteger(options.maxCandidates, 10, 15);
  const concurrency = boundedInteger(options.concurrency, 4, 5);
  const enrichedResults = [...results];
  const reports: TajaAutoEnrichmentReport[] = results.map((result, index) => ({
    productUrl: result.productUrl,
    status: index >= maxCandidates
      ? TajaAutoEnrichmentStatuses.SKIPPED_LIMIT
      : isSupportedProductUrl(result.productUrl)
        ? TajaAutoEnrichmentStatuses.UNCHANGED
        : TajaAutoEnrichmentStatuses.SKIPPED_UNSUPPORTED,
    fieldsFilled: [],
    fieldsCorrected: [],
  }));
  const work = results
    .map((result, index) => ({ result, index }))
    .filter(({ result, index }) =>
      index < maxCandidates && isSupportedProductUrl(result.productUrl),
    );
  let cursor = 0;

  async function worker() {
    while (cursor < work.length) {
      const current = work[cursor];
      cursor += 1;
      if (!current) return;
      try {
        const preview = await provider.previewSupplierOfferUrl(current.result.productUrl);
        const merged = mergePreview(current.result, preview);
        enrichedResults[current.index] = merged.result;
        reports[current.index] = {
          productUrl: current.result.productUrl,
          status: merged.fieldsFilled.length > 0 || merged.fieldsCorrected.length > 0
            ? TajaAutoEnrichmentStatuses.ENRICHED
            : TajaAutoEnrichmentStatuses.UNCHANGED,
          fieldsFilled: merged.fieldsFilled,
          fieldsCorrected: merged.fieldsCorrected,
        };
      } catch (error) {
        reports[current.index] = {
          productUrl: current.result.productUrl,
          status: TajaAutoEnrichmentStatuses.FAILED,
          fieldsFilled: [],
          fieldsCorrected: [],
          failureCode: failureCode(error),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, work.length)) }, () => worker()),
  );

  return {
    results: enrichedResults,
    summary: {
      requestedCandidates: results.length,
      attemptedCandidates: work.length,
      enrichedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.ENRICHED).length,
      correctedCandidates: reports.filter((report) => report.fieldsCorrected.length > 0).length,
      unchangedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.UNCHANGED).length,
      failedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.FAILED).length,
      skippedUnsupportedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.SKIPPED_UNSUPPORTED).length,
      skippedByLimitCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.SKIPPED_LIMIT).length,
      reports,
    } satisfies TajaAutoEnrichmentSummary,
  };
}
