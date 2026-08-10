import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const optionalNumberText = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : String(value)),
  z.string().trim().regex(/^\d+(?:\.\d+)?$/).nullable(),
);

const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : Number(value)),
  z.number().positive().finite().max(1_000_000).nullable(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : Number(value)),
  z.number().int().positive().max(2_147_483_647).nullable(),
);

export const previewRequestSchema = z.object({
  productUrl: z.string().trim().max(2_000).refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Only valid HTTPS URLs are allowed."),
}).strict();

export const productPriceTierSchema = z.object({
  price: z.string().trim().regex(/^\d+(?:\.\d+)?$/),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable(),
  minQuantity: z.number().int().positive(),
  maxQuantity: z.number().int().positive().nullable(),
}).strict().superRefine((tier, context) => {
  if (tier.maxQuantity !== null && tier.maxQuantity < tier.minQuantity) {
    context.addIssue({
      code: "custom",
      path: ["maxQuantity"],
      message: "Maximum tier quantity cannot be lower than minimum quantity.",
    });
  }
});

export const productAttributeCategorySchema = z.enum([
  "PRODUCT_SPECIFICATION",
  "SUPPLIER_COMMERCIAL",
  "MARKETPLACE_SERVICE",
  "OTHER",
]);

export const productAttributeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(500),
  category: productAttributeCategorySchema.default("OTHER"),
}).strict();

export const productVariantGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  values: z.array(z.string().trim().min(1).max(200)).min(2).max(30),
}).strict();

export const productPackagingSchema = z.object({
  sellingUnit: optionalText(120),
  packageType: optionalText(120),
  packageLengthCm: optionalPositiveNumber,
  packageWidthCm: optionalPositiveNumber,
  packageHeightCm: optionalPositiveNumber,
  grossWeightKg: optionalPositiveNumber,
  piecesPerCarton: optionalPositiveInteger,
  scope: z.enum(["SELLING_UNIT", "CARTON", "UNKNOWN"]).default("UNKNOWN"),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).default("LOW"),
  usableForLandedCost: z.boolean().default(false),
  validationNote: optionalText(300),
}).strict();

export const marketplaceProductDetailsSchema = z.object({
  adapter: z.enum([
    "made-in-china-product-page-v1",
    "made-in-china-product-page-v2",
  ]),
  evidence: z.literal("PRODUCT_PAGE"),
  priceTiers: z.array(productPriceTierSchema).max(20),
  attributes: z.array(productAttributeSchema).max(80),
  variants: z.array(productVariantGroupSchema).max(20),
  packaging: productPackagingSchema.nullable(),
}).strict();

export const productPreviewSchema = z.object({
  productTitle: optionalText(300),
  supplierName: optionalText(200),
  price: optionalNumberText,
  currency: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
    z.string().regex(/^[A-Z]{3}$/).nullable(),
  ),
  minimumOrderQuantity: optionalNumberText,
  incoterm: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? null : String(value).toUpperCase()),
    z.string().trim().min(2).max(20).nullable(),
  ),
  imageUrl: optionalText(2_000).refine((value) => value === null || z.url().safeParse(value).success),
  productUrl: previewRequestSchema.shape.productUrl,
  details: marketplaceProductDetailsSchema.nullable().optional(),
}).strict();

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type ProductPreview = z.infer<typeof productPreviewSchema>;
export type MarketplaceProductDetails = z.infer<typeof marketplaceProductDetailsSchema>;
export type ProductAttributeCategory = z.infer<typeof productAttributeCategorySchema>;

export type ErrorReason = "NETWORK_ERROR" | "BLOCKED" | "PARSING_FAILED" | "INVALID_URL" | "TIMEOUT";

export type PreviewSuccess = { preview: ProductPreview };
export type PreviewFailure = { error: string; reason: ErrorReason };
