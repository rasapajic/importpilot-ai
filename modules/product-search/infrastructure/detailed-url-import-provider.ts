import {
  selectSupplierOfferPriceTier,
} from "../domain/marketplace-product-details";
import {
  supplierOfferUrlImportRequestSchema,
  supplierOfferUrlPreviewSchema,
  type SupplierOfferUrlImportProvider,
  type SupplierOfferUrlPreview,
} from "../domain/search";
import {
  detectUrlImportProvider,
  hasUrlProductIdentifier,
  supplierOfferUrlImportProvider,
  UrlImportBlockedError,
  UrlImportExternalProviderError,
  UrlImportMissingProductIdentifierError,
  UrlImportParsingError,
  UrlImportTimeoutError,
  UrlImportUnsupportedUrlError,
} from "./url-import-provider";

const DEFAULT_TIMEOUT_MS = 8_000;

type DetailedProviderOptions = {
  endpoint?: string | null;
  token?: string;
  requestedQuantity?: number | null;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  fallbackProvider?: SupplierOfferUrlImportProvider;
};

function normalizeExternalPreview(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const record = candidate as Record<string, unknown>;
  const productUrl = record.productUrl;
  let source = record.source;
  if (!source && typeof productUrl === "string") {
    try {
      source = new URL(productUrl).hostname;
    } catch {
      source = "external-url-import-provider";
    }
  }
  const normalized = {
    title: record.title ?? record.productTitle ?? null,
    supplierName: record.supplierName ?? null,
    supplierCountry: record.supplierCountry ?? null,
    price: record.price ?? null,
    currency: record.currency ?? null,
    minimumOrderQuantity: record.minimumOrderQuantity ?? null,
    incoterm: record.incoterm ?? null,
    productUrl,
    imageUrl: record.imageUrl ?? null,
    source,
    details: record.details ?? null,
    titleFromSlug: record.titleFromSlug ?? false,
  };
  const requiredPreviewValues = [
    normalized.title,
    normalized.supplierName,
    normalized.price,
    normalized.currency,
    normalized.minimumOrderQuantity,
    normalized.imageUrl,
    normalized.productUrl,
  ];
  const inferredIsPartial = requiredPreviewValues.some(Boolean) &&
    !requiredPreviewValues.every(Boolean);
  return {
    ...normalized,
    isPartial: record.isPartial ?? inferredIsPartial,
  };
}

function selectRequestedTier(
  preview: SupplierOfferUrlPreview,
  requestedQuantity: number | null | undefined,
) {
  const tier = selectSupplierOfferPriceTier(preview.details, requestedQuantity);
  if (!tier) return preview;
  const currency = tier.currency ?? preview.currency;
  if (!currency) return preview;
  return supplierOfferUrlPreviewSchema.parse({
    ...preview,
    price: tier.price,
    currency,
  });
}

function endpointFromEnvironment() {
  return process.env.URL_IMPORT_PROVIDER_URL?.trim() || null;
}

function providerTokenFromEnvironment() {
  return process.env.URL_IMPORT_PROVIDER_TOKEN?.trim() || undefined;
}

function providerError(payload: unknown, status: number) {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null;
  const reason = String(record?.reason ?? "").toUpperCase();
  const message = typeof record?.error === "string"
    ? record.error
    : `External URL import provider failed with HTTP ${status}.`;
  if (reason === "BLOCKED") return new UrlImportBlockedError(message);
  if (reason === "TIMEOUT") return new UrlImportTimeoutError();
  if (reason === "PARSING_FAILED") return new UrlImportParsingError(message);
  if (reason === "INVALID_URL") return new UrlImportUnsupportedUrlError(message);
  return new UrlImportExternalProviderError(message);
}

export function createDetailedSupplierOfferUrlImportProvider(
  options: DetailedProviderOptions = {},
): SupplierOfferUrlImportProvider {
  const endpoint = options.endpoint ?? endpointFromEnvironment();
  const token = options.token ?? providerTokenFromEnvironment();
  const fetcher = options.fetcher ?? fetch;
  const fallbackProvider = options.fallbackProvider ?? supplierOfferUrlImportProvider;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!endpoint) return fallbackProvider;

  return {
    async previewSupplierOfferUrl(input) {
      const request = supplierOfferUrlImportRequestSchema.safeParse({ productUrl: input });
      if (!request.success) throw request.error;
      const productUrl = request.data.productUrl;
      const url = new URL(productUrl);
      const provider = detectUrlImportProvider(url);
      if (provider === "unknown") {
        throw new UrlImportUnsupportedUrlError("Unsupported supplier URL.");
      }
      if (!hasUrlProductIdentifier(provider, url)) {
        throw new UrlImportMissingProductIdentifierError("Missing product identifier.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ productUrl }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) throw providerError(payload, response.status);
        const record = payload && typeof payload === "object"
          ? payload as Record<string, unknown>
          : null;
        const candidate = record && "preview" in record ? record.preview : payload;
        const preview = supplierOfferUrlPreviewSchema.parse(
          normalizeExternalPreview(candidate),
        );
        return selectRequestedTier(preview, options.requestedQuantity);
      } catch (error) {
        if (
          error instanceof UrlImportBlockedError ||
          error instanceof UrlImportTimeoutError ||
          error instanceof UrlImportParsingError ||
          error instanceof UrlImportUnsupportedUrlError ||
          error instanceof UrlImportMissingProductIdentifierError ||
          error instanceof UrlImportExternalProviderError
        ) {
          throw error;
        }
        if (controller.signal.aborted) throw new UrlImportTimeoutError();
        throw new UrlImportExternalProviderError(
          error instanceof Error ? error.message : "External URL import provider failed.",
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getDetailedSupplierOfferUrlImportProvider(options: {
  requestedQuantity?: number | null;
} = {}) {
  return createDetailedSupplierOfferUrlImportProvider({
    requestedQuantity: options.requestedQuantity,
  });
}
