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

const rawMarketplaceProductDetailsSchema = z.object({
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

type RawProductAttribute = z.infer<typeof productAttributeSchema>;
type RawProductPackaging = z.infer<typeof productPackagingSchema>;

const PACKAGING_ATTRIBUTE_PATTERN = /\b(?:selling\s+units?|package\s+(?:type|size|dimension|gross\s+weight)|carton\s+(?:size|dimension)|pieces?\s+per\s+carton|qty\.?\s+per\s+carton|packing\s+(?:quantity|size|weight|type))\b/i;
const MARKETPLACE_SERVICE_PATTERN = /\b(?:dispute\s+resolution|flexible\s+payment|payment\s+protection|platform\s+logistics|inspection\s+service|after[-\s]*sales.*dispute|secured\s+trading|trade\s+assurance|refund\s+support|platform[-\s]*protected|shopping\s+protection)\b/i;
const SUPPLIER_COMMERCIAL_PATTERN = /\b(?:production\s+capacity|annual\s+(?:capacity|output)|payment\s+terms?|terms?\s+of\s+payment|average\s+lead\s+time|lead\s+time|main\s+markets?|export\s+markets?|main\s+port|nearest\s+port|international\s+commercial\s+terms?|incoterms?|factory\s+size|number\s+of\s+employees|year\s+established|export\s+year|responsible\s+person|address|customi[sz](?:ation|able)|shipping\s+cost|delivery\s+time|supply\s+ability)\b/i;
const PRODUCT_SPECIFICATION_PATTERN = /\b(?:product\s+name|model|application|scenario|inlet\s+method|material|flow|pressure|certification|certificate|control|function|water\s+tank|humidification|installation|product\s+type|type|keyword|usage|power\s+source|pump|nozzle|voltage|specification|origin|brand|trademark|accessory|capacity|frequency|current|diameter|length|width|height|temperature|working\s+range|spray|fog|mist|cooling)\b/i;
const SAFE_VARIANT_NAME_PATTERN = /^(?:color|colour|size|flow|nozzle\s+(?:diameter|size)|orifice\s+(?:diameter|size)|diameter|voltage|power|length|configuration|style)$/i;
const UNSAFE_VARIANT_NAME_PATTERN = /\b(?:production|capacity|market|payment|address|certification|certificate|accessory|material|model|type|keyword|usage|shipping|lead\s+time|port|origin|brand|trademark)\b/i;
const RELIABLE_SELLING_UNIT_PATTERN = /\b(?:single\s+item|single\s+unit|piece|pc|unit|set|kit|pair)\b/i;
const MAX_PLAUSIBLE_PACKAGED_DENSITY_KG_PER_CBM = 5_000;

function classifyAttribute(attribute: RawProductAttribute) {
  if (attribute.category !== "OTHER") return attribute.category;
  const combined = `${attribute.name} ${attribute.value}`;
  if (MARKETPLACE_SERVICE_PATTERN.test(combined)) return "MARKETPLACE_SERVICE" as const;
  if (SUPPLIER_COMMERCIAL_PATTERN.test(attribute.name)) return "SUPPLIER_COMMERCIAL" as const;
  if (PRODUCT_SPECIFICATION_PATTERN.test(attribute.name)) return "PRODUCT_SPECIFICATION" as const;
  return "OTHER" as const;
}

function normalizeAttributes(attributes: RawProductAttribute[]) {
  return attributes
    .filter((attribute) => !PACKAGING_ATTRIBUTE_PATTERN.test(attribute.name))
    .map((attribute) => ({
      ...attribute,
      category: classifyAttribute(attribute),
    }));
}

function normalizeVariants(
  variants: z.infer<typeof productVariantGroupSchema>[],
) {
  return variants
    .filter((variant) => {
      const normalized = variant.name.replace(/\s+/g, " ").trim();
      return SAFE_VARIANT_NAME_PATTERN.test(normalized) &&
        !UNSAFE_VARIANT_NAME_PATTERN.test(normalized);
    })
    .map((variant) => ({
      ...variant,
      values: [...new Set(variant.values.map((value) => value.trim()))]
        .filter((value) => value.length > 0 && value.length <= 80),
    }))
    .filter((variant) => variant.values.length >= 2)
    .slice(0, 20);
}

function packageDensity(packaging: RawProductPackaging) {
  if (
    packaging.packageLengthCm === null ||
    packaging.packageWidthCm === null ||
    packaging.packageHeightCm === null ||
    packaging.grossWeightKg === null
  ) {
    return null;
  }
  const volumeCbm = (
    packaging.packageLengthCm *
    packaging.packageWidthCm *
    packaging.packageHeightCm
  ) / 1_000_000;
  if (!Number.isFinite(volumeCbm) || volumeCbm <= 0) return null;
  return packaging.grossWeightKg / volumeCbm;
}

function normalizePackaging(packaging: RawProductPackaging | null) {
  if (!packaging) return null;
  const completeDimensions =
    packaging.packageLengthCm !== null &&
    packaging.packageWidthCm !== null &&
    packaging.packageHeightCm !== null;
  const hasWeight = packaging.grossWeightKg !== null;
  const density = packageDensity(packaging);
  const physicallyPlausible = density === null ||
    density <= MAX_PLAUSIBLE_PACKAGED_DENSITY_KG_PER_CBM;
  const explicitCarton = packaging.piecesPerCarton !== null;
  const explicitSellingUnit = Boolean(
    packaging.sellingUnit && RELIABLE_SELLING_UNIT_PATTERN.test(packaging.sellingUnit),
  );
  const scope = explicitCarton
    ? "CARTON" as const
    : explicitSellingUnit
      ? "SELLING_UNIT" as const
      : "UNKNOWN" as const;
  const usableForLandedCost = Boolean(
    completeDimensions &&
    hasWeight &&
    scope !== "UNKNOWN" &&
    physicallyPlausible,
  );
  const confidence = usableForLandedCost
    ? scope === "CARTON"
      ? "HIGH" as const
      : "MEDIUM" as const
    : "LOW" as const;
  const validationNote = !completeDimensions || !hasWeight
    ? "Package dimensions and gross weight are incomplete."
    : !physicallyPlausible
      ? "Package dimensions and weight produce an implausible packaged density."
      : scope === "UNKNOWN"
        ? "Package dimensions and weight are not tied to a confirmed selling unit or carton."
        : null;
  return {
    ...packaging,
    scope,
    confidence,
    usableForLandedCost,
    validationNote,
  };
}

export const marketplaceProductDetailsSchema =
  rawMarketplaceProductDetailsSchema.transform((details) => ({
    ...details,
    adapter: "made-in-china-product-page-v2" as const,
    attributes: normalizeAttributes(details.attributes),
    variants: normalizeVariants(details.variants),
    packaging: normalizePackaging(details.packaging),
  }));

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
