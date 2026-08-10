import { z } from "zod";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(max).nullable(),
  );

const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : Number(value)),
  z.number().positive().finite().max(1_000_000).nullable(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : Number(value)),
  z.number().int().positive().max(2_147_483_647).nullable(),
);

export const supplierOfferPriceTierSchema = z.object({
  price: z.preprocess(
    (value) => Number(value),
    z.number().nonnegative().finite(),
  ),
  currency: z.preprocess(
    (value) => (value === "" || value === undefined || value === null
      ? null
      : String(value).toUpperCase()),
    z.string().regex(/^[A-Z]{3}$/).nullable(),
  ),
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

export const supplierOfferProductAttributeCategorySchema = z.enum([
  "PRODUCT_SPECIFICATION",
  "SUPPLIER_COMMERCIAL",
  "MARKETPLACE_SERVICE",
  "OTHER",
]);

export const supplierOfferProductAttributeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(500),
  category: supplierOfferProductAttributeCategorySchema.default("OTHER"),
}).strict();

export const supplierOfferProductVariantGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  values: z.array(z.string().trim().min(1).max(200)).min(2).max(30),
}).strict();

export const supplierOfferPackagingSchema = z.object({
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

export const supplierOfferMarketplaceDetailsSchema = z.object({
  adapter: z.string().trim().min(1).max(100),
  evidence: z.enum(["PRODUCT_PAGE", "SEARCH_SNIPPET"]),
  priceTiers: z.array(supplierOfferPriceTierSchema).max(20),
  attributes: z.array(supplierOfferProductAttributeSchema).max(80),
  variants: z.array(supplierOfferProductVariantGroupSchema).max(20),
  packaging: supplierOfferPackagingSchema.nullable(),
}).strict();

export type SupplierOfferPriceTier = z.infer<typeof supplierOfferPriceTierSchema>;
export type SupplierOfferProductAttributeCategory = z.infer<
  typeof supplierOfferProductAttributeCategorySchema
>;
export type SupplierOfferProductAttribute = z.infer<typeof supplierOfferProductAttributeSchema>;
export type SupplierOfferProductVariantGroup = z.infer<typeof supplierOfferProductVariantGroupSchema>;
export type SupplierOfferPackaging = z.infer<typeof supplierOfferPackagingSchema>;
export type SupplierOfferMarketplaceDetails = z.infer<typeof supplierOfferMarketplaceDetailsSchema>;

export function selectSupplierOfferPriceTier(
  details: SupplierOfferMarketplaceDetails | null | undefined,
  quantity: number | null | undefined,
) {
  if (!details || !Number.isInteger(quantity) || Number(quantity) <= 0) return null;
  const requestedQuantity = Number(quantity);
  return [...details.priceTiers]
    .sort((left, right) => right.minQuantity - left.minQuantity)
    .find((tier) =>
      requestedQuantity >= tier.minQuantity &&
      (tier.maxQuantity === null || requestedQuantity <= tier.maxQuantity),
    ) ?? null;
}

export function marketplaceDetailsEvidenceText(
  title: string,
  details: SupplierOfferMarketplaceDetails | null | undefined,
) {
  if (!details) return title;
  const attributes = details.attributes
    .filter((attribute) => attribute.category === "PRODUCT_SPECIFICATION")
    .map((attribute) => `${attribute.name}: ${attribute.value}`);
  const variants = details.variants
    .map((variant) => `${variant.name}: ${variant.values.join(", ")}`);
  return [title, ...attributes, ...variants].join(" · ").slice(0, 8_000);
}

export function marketplaceDetailsToSupplierLogistics(
  details: SupplierOfferMarketplaceDetails | null | undefined,
) {
  const packaging = details?.packaging;
  if (!packaging || !packaging.usableForLandedCost) return null;

  const hasCompleteDimensions =
    packaging.packageLengthCm !== null &&
    packaging.packageWidthCm !== null &&
    packaging.packageHeightCm !== null;
  const hasVerifiedWeight = packaging.grossWeightKg !== null;
  const scopeIsUsable =
    packaging.scope === "SELLING_UNIT" ||
    (packaging.scope === "CARTON" && packaging.piecesPerCarton !== null);

  if (!hasCompleteDimensions || !hasVerifiedWeight || !scopeIsUsable) return null;

  return {
    grossWeightKg: packaging.grossWeightKg,
    netWeightKg: null,
    cartonLengthCm: packaging.packageLengthCm,
    cartonWidthCm: packaging.packageWidthCm,
    cartonHeightCm: packaging.packageHeightCm,
    piecesPerCarton: packaging.scope === "SELLING_UNIT"
      ? packaging.piecesPerCarton ?? 1
      : packaging.piecesPerCarton,
    unitWeightKg: null,
    unitVolumeCbm: null,
    evidence: details.evidence,
  } as const;
}
