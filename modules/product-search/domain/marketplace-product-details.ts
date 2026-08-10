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

const rawSupplierOfferMarketplaceDetailsSchema = z.object({
  adapter: z.string().trim().min(1).max(100),
  evidence: z.enum(["PRODUCT_PAGE", "SEARCH_SNIPPET"]),
  priceTiers: z.array(supplierOfferPriceTierSchema).max(20),
  attributes: z.array(supplierOfferProductAttributeSchema).max(80),
  variants: z.array(supplierOfferProductVariantGroupSchema).max(20),
  packaging: supplierOfferPackagingSchema.nullable(),
}).strict();

type RawProductAttribute = z.infer<typeof supplierOfferProductAttributeSchema>;
type RawProductPackaging = z.infer<typeof supplierOfferPackagingSchema>;

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

function credibleVariantName(name: string) {
  const normalized = name.replace(/\s+/g, " ").trim();
  return SAFE_VARIANT_NAME_PATTERN.test(normalized) &&
    !UNSAFE_VARIANT_NAME_PATTERN.test(normalized);
}

function normalizeVariants(
  variants: z.infer<typeof supplierOfferProductVariantGroupSchema>[],
) {
  return variants
    .filter((variant) => credibleVariantName(variant.name))
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
  const scopeComplete = scope === "SELLING_UNIT" ||
    (scope === "CARTON" && packaging.piecesPerCarton !== null);
  const usableForLandedCost = Boolean(
    completeDimensions &&
    hasWeight &&
    scopeComplete &&
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

export const supplierOfferMarketplaceDetailsSchema =
  rawSupplierOfferMarketplaceDetailsSchema.transform((details) => ({
    ...details,
    attributes: normalizeAttributes(details.attributes),
    variants: normalizeVariants(details.variants),
    packaging: normalizePackaging(details.packaging),
  }));

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
