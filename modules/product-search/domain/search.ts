import { z } from "zod";
import { normalizeTargetCountryCode } from "../../i18n/country-names";
import {
  supplierOfferMarketplaceDetailsSchema,
  type SupplierOfferMarketplaceDetails,
  type SupplierOfferPackaging,
  type SupplierOfferPriceTier,
  type SupplierOfferProductAttribute,
  type SupplierOfferProductVariantGroup,
} from "./marketplace-product-details";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    schema.nullable(),
  );

const optionalRequestNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    schema.optional(),
  );

const optionalRequestCurrency = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : String(value).toUpperCase()),
  z.string().regex(/^[A-Z]{3}$/).optional(),
);

const searchQueryVariantsSchema = z.array(
  z.string().trim().min(2).max(300),
).max(5).optional();

const isoDateTime = z.string().trim().refine((value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && value.includes("T");
}, "Invalid ISO date-time.");

const nonnegativeInteger = z.number().int().nonnegative();
const positiveLogisticsNumber = z.number().positive().finite().max(1_000_000);

export const supplierOfferLogisticsSchema = z
  .object({
    grossWeightKg: optionalNumber(positiveLogisticsNumber),
    netWeightKg: optionalNumber(positiveLogisticsNumber),
    cartonLengthCm: optionalNumber(positiveLogisticsNumber),
    cartonWidthCm: optionalNumber(positiveLogisticsNumber),
    cartonHeightCm: optionalNumber(positiveLogisticsNumber),
    piecesPerCarton: optionalNumber(z.number().int().positive().max(2_147_483_647)),
    unitWeightKg: optionalNumber(positiveLogisticsNumber),
    unitVolumeCbm: optionalNumber(positiveLogisticsNumber),
    evidence: z.enum(["PRODUCT_PAGE", "SEARCH_SNIPPET"]),
  })
  .strict();

export const supplierOfferSearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(300),
    queryVariants: searchQueryVariantsSchema,
    chinese1688QueryVariants: searchQueryVariantsSchema,
    quantity: z.number().int().positive(),
    targetCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)
      .transform(normalizeTargetCountryCode),
  })
  .strict();

export const supplierOfferSearchProvenanceSchema = z
  .object({
    fetchedAt: isoDateTime,
    resultOrigin: z.enum(["live", "cache", "url-import", "browser-assisted-1688", "manual"]),
    originalQuery: optionalText(200),
    providerQuery: optionalText(300),
    chinese1688Query: optionalText(300),
    targetCountry: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ),
    quantity: optionalNumber(z.number().int().positive()),
  })
  .strict();

export const supplierOfferSearchResultSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    supplierName: z.string().trim().min(1).max(200),
    supplierCountry: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ),
    price: optionalNumber(z.number().nonnegative().finite()),
    currency: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{3}$/).nullable(),
    ),
    advertisedPrice: z.number().positive().finite().nullish(),
    advertisedCurrency: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (value === "" || value === null) return null;
        return String(value).toUpperCase();
      },
      z.string().regex(/^[A-Z]{3}$/).nullish(),
    ),
    advertisedPriceHigh: z.number().positive().finite().nullish(),
    minimumOrderQuantity: optionalNumber(z.number().int().positive()),
    incoterm: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().trim().min(2).max(20).nullable(),
    ),
    productUrl: z.url().max(2_000),
    imageUrl: optionalText(2_000).refine(
      (value) => value === null || z.url().safeParse(value).success,
      "Image URL must be valid.",
    ),
    source: z.string().trim().min(1).max(100),
    priceEvidence: z.enum(["MARKETPLACE_SEARCH", "PRODUCT_PAGE"]).optional(),
    marketplaceDetails: supplierOfferMarketplaceDetailsSchema.nullable().optional(),
    supplierLogistics: supplierOfferLogisticsSchema.nullable().optional(),
    provenance: supplierOfferSearchProvenanceSchema.optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if ((result.price === null) !== (result.currency === null)) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Price and currency must be provided together.",
      });
    }
    const advertisedPriceMissing = result.advertisedPrice === null || result.advertisedPrice === undefined;
    const advertisedCurrencyMissing = result.advertisedCurrency === null || result.advertisedCurrency === undefined;
    const advertisedLow = result.advertisedPrice ?? result.price;
    if (advertisedPriceMissing !== advertisedCurrencyMissing) {
      context.addIssue({
        code: "custom",
        path: ["advertisedCurrency"],
        message: "Advertised price and currency must be provided together.",
      });
    }
    if (
      result.advertisedPriceHigh !== null &&
      result.advertisedPriceHigh !== undefined &&
      (advertisedLow === null || advertisedLow === undefined || result.advertisedPriceHigh <= advertisedLow)
    ) {
      context.addIssue({
        code: "custom",
        path: ["advertisedPriceHigh"],
        message: "Advertised price high must be greater than the advertised low price.",
      });
    }
  });

export const supplierOfferSearchResultsSchema = z.array(supplierOfferSearchResultSchema).max(100);

export const supplierOfferSearchSummarySchema = z
  .object({
    mode: z.literal("deep-search-phase1"),
    configuredSources: nonnegativeInteger,
    successfulSources: nonnegativeInteger,
    parsedResults: nonnegativeInteger,
    relevantCandidates: nonnegativeInteger,
    duplicateResultsRemoved: nonnegativeInteger,
    unprocessedCandidates: nonnegativeInteger,
    returnedResults: nonnegativeInteger,
    sourceResultCounts: z.record(
      z.string().trim().min(1).max(100),
      nonnegativeInteger,
    ),
  })
  .strict();

export const projectSupplierSearchRequestSchema = supplierOfferSearchInputSchema
  .omit({ queryVariants: true, chinese1688QueryVariants: true })
  .extend({
    maxUnitPrice: optionalRequestNumber(z.number().positive().finite()),
    maxUnitPriceCurrency: optionalRequestCurrency,
    strictPriceLimit: z.boolean().optional(),
    maxMoq: optionalRequestNumber(z.number().int().positive()),
    targetMarginPercent: optionalRequestNumber(z.number().min(0).max(100).finite()),
    avoidComplexCompliance: z.boolean().optional().default(false),
    privateLabel: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((request, context) => {
    if ((request.maxUnitPrice === undefined) !== (request.maxUnitPriceCurrency === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["maxUnitPriceCurrency"],
        message: "Maximum unit price and currency must be provided together.",
      });
    }
    if (request.strictPriceLimit && request.maxUnitPrice === undefined) {
      context.addIssue({
        code: "custom",
        path: ["strictPriceLimit"],
        message: "Strict price filtering requires a maximum unit price.",
      });
    }
  });

export const supplierOfferUrlImportRequestSchema = z
  .object({
    productUrl: z.string().trim().max(2_000).refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only valid HTTPS URLs are allowed."),
  })
  .strict();

// Only the authenticated project URL-preview endpoint accepts the explicit
// source verification marker. Keep the base import schema strict for all
// other callers, and reject unknown fields or a false/non-boolean flag.
export const supplierOfferSourceMoqCheckRequestSchema =
  supplierOfferUrlImportRequestSchema.safeExtend({
    sourceMoqCheck: z.literal(true).optional(),
  });

// Strict browser-link provenance. The supplementary URL is a fixed platform
// host derived from the exact original product's supplier, SKU and slug.
export function isExactProductVideoEvidenceUrl(productUrl: string, evidenceUrl: string): boolean {
  try {
    const source = new URL(productUrl);
    const video = new URL(evidenceUrl);
    if (source.protocol !== "https:" || video.protocol !== "https:" ||
        source.search || source.hash || source.port || source.username || source.password ||
        video.search || video.hash || video.port || video.username || video.password) return false;
    const host = source.hostname.match(/^([a-z0-9-]{2,48})\.en\.made-in-china\.com$/i);
    const product = source.pathname.match(/^\/product\/([A-Za-z0-9]{8,32})\/China-([A-Za-z0-9][A-Za-z0-9-]{5,230})\.html$/i);
    if (!host || !product) return false;
    return video.href === "https://www.made-in-china.com/video-channel/" +
      host[1].toLowerCase() + "_" + product[1] + "_" + product[2] + ".html";
  } catch {
    return false;
  }
}

function isSellerCatalogEvidenceUrl(productUrl: string, catalogUrl: string): boolean {
  try {
    const source = new URL(productUrl);
    const catalog = new URL(catalogUrl);
    if (source.protocol !== "https:" || catalog.protocol !== "https:" ||
        source.username || source.password || catalog.username || catalog.password ||
        source.port || catalog.port || source.search || source.hash ||
        catalog.search || catalog.hash) return false;
    const seller = source.hostname.match(/^([a-z0-9-]+)\.en\.made-in-china\.com$/i);
    if (!seller || catalog.hostname.toLowerCase() !== source.hostname.toLowerCase() ||
        !/^\/product\/[A-Za-z0-9]{8,32}\/China-[A-Za-z0-9-]+\.html$/.test(source.pathname)) return false;
    return /^\/product-group\/[A-Za-z0-9]{6,}\/[A-Za-z0-9-]+-catalog-[0-9]+\.html$/i.test(catalog.pathname);
  } catch {
    return false;
  }
}

/** Preview-only source provenance, never a supplier-issued quantity quote. */
const publicEvidenceBase = {
  productUrl: supplierOfferUrlImportRequestSchema.shape.productUrl,
  lowPrice: z.number().positive().finite(),
  highPrice: z.number().positive().finite(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  unit: z.enum(["Piece", "Set", "Unit"]),
  minimumOrderQuantity: z.number().int().positive(),
  verifiedQuote: z.literal(false),
};

export const supplierOfferMarketplacePriceEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    ...publicEvidenceBase,
    kind: z.literal("SINGLE_SELLER_CATALOG_ADVERTISED_RANGE"),
    sourceUrl: z.url(),
    corroborated: z.literal(false),
  }).strict(),
  z.object({
    ...publicEvidenceBase,
    kind: z.literal("CORROBORATED_ADVERTISED_RANGE"),
    evidence: z.tuple([z.url(), z.url()]),
  }).strict(),
]).superRefine((value, ctx) => {
  if (!(value.highPrice > value.lowPrice)) {
    ctx.addIssue({ code: "custom", path: ["highPrice"], message: "Invalid public range." });
  }
  const linksValid = value.kind === "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE"
    ? isSellerCatalogEvidenceUrl(value.productUrl, value.sourceUrl)
    : isExactProductVideoEvidenceUrl(value.productUrl, value.evidence[0]) &&
      isSellerCatalogEvidenceUrl(value.productUrl, value.evidence[1]) &&
      value.evidence[0] !== value.evidence[1];
  if (!linksValid) {
    ctx.addIssue({
      code: "custom", path: ["kind"],
      message: "Public evidence does not match the exact product and seller.",
    });
  }
});

// Preview-only marketplace evidence: NEVER a confirmed supplier quotation.
export const supplierOfferAdvertisedRangeSchema = z.object({
  lowPrice: z.number().positive().finite(),
  highPrice: z.number().positive().finite(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  unit: z.enum(["Piece", "Set", "Unit"]).nullable(),
  evidence: z.enum(["EXACT_PRODUCT_JSONLD", "MATCHED_VIDEO_CHANNEL"]),
  sourceUrl: supplierOfferUrlImportRequestSchema.shape.productUrl,
  evidenceUrl: supplierOfferUrlImportRequestSchema.shape.productUrl.optional(),
}).strict().superRefine((range, context) => {
  if (range.evidence === "MATCHED_VIDEO_CHANNEL" &&
      (!range.evidenceUrl || !isExactProductVideoEvidenceUrl(range.sourceUrl, range.evidenceUrl))) {
    context.addIssue({ code: "custom", path: ["evidenceUrl"],
      message: "Video source does not refer to exact product." });
  }
  if (range.evidence === "EXACT_PRODUCT_JSONLD" && range.evidenceUrl !== undefined) {
    context.addIssue({ code: "custom", path: ["evidenceUrl"],
      message: "JSON-LD evidence cannot claim an unrelated secondary page." });
  }
  if (range.highPrice <= range.lowPrice) {
    context.addIssue({ code: "custom", path: ["highPrice"], message: "Range bounds out of order." });
  }
});

export const supplierOfferUrlPreviewSchema = z
  .object({
    title: optionalText(300),
    supplierName: optionalText(200),
    supplierCountry: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ),
    price: optionalNumber(z.number().nonnegative().finite()),
    currency: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{3}$/).nullable(),
    ),
    minimumOrderQuantity: optionalNumber(z.number().int().positive()),
    advertisedPriceRange: supplierOfferAdvertisedRangeSchema.nullable().optional(),
    marketplacePriceEvidence: supplierOfferMarketplacePriceEvidenceSchema.nullable().optional(),
    incoterm: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().trim().min(2).max(20).nullable(),
    ),
    productUrl: supplierOfferUrlImportRequestSchema.shape.productUrl,
    imageUrl: optionalText(2_000).refine(
      (value) => value === null || z.url().safeParse(value).success,
      "Image URL must be valid.",
    ),
    source: z.string().trim().min(1).max(100),
    details: supplierOfferMarketplaceDetailsSchema.nullable().optional(),
    isPartial: z.boolean().default(false),
    titleFromSlug: z.boolean().default(false),
  })
  .strict().superRefine((preview, context) => {
    if (preview.marketplacePriceEvidence) {
      const evidence = preview.marketplacePriceEvidence;
      if (evidence.productUrl !== preview.productUrl ||
          preview.minimumOrderQuantity === null ||
          evidence.minimumOrderQuantity !== preview.minimumOrderQuantity ||
          (preview.currency !== null && evidence.currency !== preview.currency)) {
        context.addIssue({
          code: "custom", path: ["marketplacePriceEvidence"],
          message: "Public evidence must match product, seller MOQ and currency.",
        });
      }
      if (preview.advertisedPriceRange &&
          (preview.advertisedPriceRange.lowPrice !== evidence.lowPrice ||
           preview.advertisedPriceRange.highPrice !== evidence.highPrice ||
           preview.advertisedPriceRange.currency !== evidence.currency)) {
        context.addIssue({
          code: "custom", path: ["marketplacePriceEvidence"],
          message: "Conflicting public price evidence must not be displayed.",
        });
      }
    }
    if (preview.advertisedPriceRange) {
      const evidence = preview.advertisedPriceRange;
      if (evidence.sourceUrl !== preview.productUrl ||
          (preview.currency !== null && evidence.currency !== preview.currency)) {
        context.addIssue({
          code: "custom",
          path: ["advertisedPriceRange"],
          message: "Advertised range must match the exact product and currency.",
        });
      }
    }
  });

export type SupplierOfferSearchInput = z.infer<typeof supplierOfferSearchInputSchema>;
export type ProjectSupplierSearchRequest = z.infer<typeof projectSupplierSearchRequestSchema>;
export type SupplierOfferSearchProvenance = z.infer<typeof supplierOfferSearchProvenanceSchema>;
export type SupplierOfferLogistics = z.infer<typeof supplierOfferLogisticsSchema>;
export type SupplierOfferSearchResult = z.infer<typeof supplierOfferSearchResultSchema>;
export type SupplierOfferSearchSummary = z.infer<typeof supplierOfferSearchSummarySchema>;
export type SupplierOfferUrlPreview = z.infer<typeof supplierOfferUrlPreviewSchema>;
export type {
  SupplierOfferMarketplaceDetails,
  SupplierOfferPackaging,
  SupplierOfferPriceTier,
  SupplierOfferProductAttribute,
  SupplierOfferProductVariantGroup,
};
export type SupplierOfferSearchProviderOutcome =
  | SupplierOfferSearchResult[]
  | {
      results: SupplierOfferSearchResult[];
      summary?: SupplierOfferSearchSummary;
      servedFromMemoryCache?: boolean;
      servedFromProviderReplay?: boolean;
    };

export interface SupplierOfferSearchProvider {
  searchSupplierOffers(
    input: SupplierOfferSearchInput,
    options?: { signal?: AbortSignal },
  ): Promise<SupplierOfferSearchProviderOutcome>;
  healthCheck?(): Promise<boolean>;
}

export interface SupplierOfferUrlImportProvider {
  previewSupplierOfferUrl(productUrl: string): Promise<SupplierOfferUrlPreview>;
}
