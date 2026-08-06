import type {
  SupplierOfferSearchResult,
  SupplierOfferUrlImportProvider,
  SupplierOfferUrlPreview,
} from "../domain/search";
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
  failureCode?: string;
};

export type TajaAutoEnrichmentSummary = {
  requestedCandidates: number;
  attemptedCandidates: number;
  enrichedCandidates: number;
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

function needsAutoEnrichment(result: SupplierOfferSearchResult) {
  return result.supplierCountry === null ||
    result.price === null ||
    result.currency === null ||
    result.minimumOrderQuantity === null ||
    result.incoterm === null ||
    result.imageUrl === null;
}

function mergePreview(
  result: SupplierOfferSearchResult,
  preview: SupplierOfferUrlPreview,
) {
  const fieldsFilled: TajaAutoEnrichmentField[] = [];
  let price = result.price;
  let currency = result.currency;
  if (
    price === null &&
    currency === null &&
    preview.price !== null &&
    preview.currency !== null
  ) {
    price = preview.price;
    currency = preview.currency;
    fieldsFilled.push("price");
  }

  const supplierCountry = result.supplierCountry ?? preview.supplierCountry;
  if (result.supplierCountry === null && supplierCountry !== null) {
    fieldsFilled.push("supplierCountry");
  }
  const minimumOrderQuantity =
    result.minimumOrderQuantity ?? preview.minimumOrderQuantity;
  if (
    result.minimumOrderQuantity === null &&
    minimumOrderQuantity !== null
  ) {
    fieldsFilled.push("minimumOrderQuantity");
  }
  const incoterm = result.incoterm ?? preview.incoterm;
  if (result.incoterm === null && incoterm !== null) fieldsFilled.push("incoterm");
  const imageUrl = result.imageUrl ?? preview.imageUrl;
  if (result.imageUrl === null && imageUrl !== null) fieldsFilled.push("imageUrl");

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
  };
}

function failureCode(error: unknown) {
  if (error instanceof Error && error.constructor.name) return error.constructor.name.slice(0, 100);
  return "UnknownAutoEnrichmentError";
}

/**
 * Enriches a bounded set of finalists from their direct marketplace pages.
 * Failures are isolated per candidate and no raw upstream error text is sent
 * to the browser. Existing verified search fields are preserved; the preview
 * only fills missing values. Complete candidates are not fetched again.
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
  }));
  const work = results
    .map((result, index) => ({ result, index }))
    .filter(({ result, index }) =>
      index < maxCandidates &&
      isSupportedProductUrl(result.productUrl) &&
      needsAutoEnrichment(result),
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
          status: merged.fieldsFilled.length > 0
            ? TajaAutoEnrichmentStatuses.ENRICHED
            : TajaAutoEnrichmentStatuses.UNCHANGED,
          fieldsFilled: merged.fieldsFilled,
        };
      } catch (error) {
        reports[current.index] = {
          productUrl: current.result.productUrl,
          status: TajaAutoEnrichmentStatuses.FAILED,
          fieldsFilled: [],
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
      unchangedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.UNCHANGED).length,
      failedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.FAILED).length,
      skippedUnsupportedCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.SKIPPED_UNSUPPORTED).length,
      skippedByLimitCandidates: reports.filter((report) => report.status === TajaAutoEnrichmentStatuses.SKIPPED_LIMIT).length,
      reports,
    } satisfies TajaAutoEnrichmentSummary,
  };
}
