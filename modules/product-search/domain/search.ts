import { z } from "zod";
import { normalizeTargetCountryCode } from "../../i18n/country-names";
import type { OfferKind } from "./offer-classification";

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

export const supplierOfferSearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    quantity: z.number().int().positive(),
    targetCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)
      .transform(normalizeTargetCountryCode),
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
    offerType: z.enum(["DOMESTIC", "DIRECT_IMPORT", "UNKNOWN"]).optional(),
    sellerCountry: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ).optional(),
    originCountry: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
      z.string().regex(/^[A-Z]{2}$/).nullable(),
    ).optional(),
    importerName: optionalText(200).optional(),
    brandName: optionalText(120).optional(),
    priceIncludesVat: z.boolean().optional(),
    netPrice: optionalNumber(z.number().nonnegative().finite()).optional(),
    availabilityConfirmed: z.boolean().optional(),
    b2bPriceConfirmed: z.boolean().optional(),
    quantityTiers: z.array(z.object({
      minQuantity: z.number().int().positive(),
      maxQuantity: z.number().int().positive().nullable(),
      price: optionalNumber(z.number().nonnegative().finite()),
      currency: z.preprocess(
        (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
        z.string().regex(/^[A-Z]{3}$/).nullable(),
      ),
      confirmed: z.boolean().default(false),
    }).strict()).max(20).optional(),
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
  });

export const supplierOfferSearchResultsSchema = z.array(supplierOfferSearchResultSchema).max(100);

export const projectSupplierSearchRequestSchema = supplierOfferSearchInputSchema;

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
    isPartial: z.boolean().default(false),
    titleFromSlug: z.boolean().default(false),
  })
  .strict();

export type SupplierOfferSearchInput = z.infer<typeof supplierOfferSearchInputSchema>;
export type SupplierOfferSearchResult = z.infer<typeof supplierOfferSearchResultSchema> & {
  offerType?: OfferKind;
};
export type SupplierOfferUrlPreview = z.infer<typeof supplierOfferUrlPreviewSchema>;

export interface SupplierOfferSearchProvider {
  searchSupplierOffers(input: SupplierOfferSearchInput): Promise<SupplierOfferSearchResult[]>;
  healthCheck?(): Promise<boolean>;
}

export interface SupplierOfferUrlImportProvider {
  previewSupplierOfferUrl(productUrl: string): Promise<SupplierOfferUrlPreview>;
}
