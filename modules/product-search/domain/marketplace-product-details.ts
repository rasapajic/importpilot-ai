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
type RawVariant = z.infer<typeof supplierOfferProductVariantGroupSchema>;
type AttributeCategory = z.infer<typeof supplierOfferProductAttributeCategorySchema>;

type AttributeAlias = {
  key: string;
  displayName: string;
  priority: number;
  mergeList?: boolean;
  category?: AttributeCategory;
};

const PACKAGING_ATTRIBUTE_PATTERN = /\b(?:selling\s+units?|transport\s+package|package\s+(?:type|size|dimension|gross\s+weight)|carton\s+(?:size|dimension)|pieces?\s+per\s+carton|qty\.?\s+per\s+carton|packing\s+(?:quantity|size|weight|type))\b/i;
const MARKETPLACE_SERVICE_PATTERN = /\b(?:dispute\s+resolution|flexible\s+payment|payment\s+protection|platform\s+logistics|inspection\s+service|after[-\s]*sales.*dispute|secured\s+trading|trade\s+assurance|refund\s+support|platform[-\s]*protected|shopping\s+protection)\b/i;
const SUPPLIER_COMMERCIAL_PATTERN = /\b(?:production\s+capacity|annual\s+(?:capacity|output)|payment\s+terms?|terms?\s+of\s+payment|average\s+lead\s+time|lead\s+time|main\s+markets?|export\s+markets?|main\s+port|nearest\s+port|international\s+commercial\s+terms?|incoterms?|factory\s+size|number\s+of\s+employees|year\s+established|export\s+year|responsible\s+person|address|customi[sz](?:ation|able)|shipping\s+cost|delivery\s+time|supply\s+ability|main\s+products?)\b/i;
const PRODUCT_SPECIFICATION_PATTERN = /\b(?:product\s+name|model|application|scenario|inlet\s+method|material|flow|pressure|certification|certificate|control|function|water\s+tank|humidification|installation|product\s+type|type|keyword|usage|power\s+source|pump|nozzle|voltage|specification|origin|brand|trademark|accessory|capacity|frequency|current|diameter|length|width|height|temperature|working\s+range|spray|fog|mist|cooling)\b/i;
const SAFE_VARIANT_NAME_PATTERN = /^(?:color|colour|size|flow|nozzle\s+(?:diameter|size)|orifice\s+(?:diameter|size)|diameter|voltage|power|length|configuration|style)$/i;
const UNSAFE_VARIANT_NAME_PATTERN = /\b(?:production|capacity|market|payment|address|certification|certificate|accessory|material|model|type|keyword|usage|shipping|lead\s+time|port|origin|brand|trademark)\b/i;
const RELIABLE_SELLING_UNIT_PATTERN = /\b(?:single\s+item|single\s+unit|piece|pc|unit|set|kit|pair)\b/i;
const MAX_PLAUSIBLE_PACKAGED_DENSITY_KG_PER_CBM = 5_000;
const REPEATED_UNIT_PATTERN = /\d+(?:[.,]\d+)?\s*(?:mm|cm|m|v|kv|w|kw|bar|psi|hz|a|l\s*\/\s*min|ml\s*\/\s*min|lpm|gpm)\b/gi;

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function attributeAlias(name: string): AttributeAlias | null {
  const normalized = normalizedName(name);
  if (normalized === "product name") {
    return { key: "product-name", displayName: "Product Name", priority: 3, category: "PRODUCT_SPECIFICATION" };
  }
  if (normalized === "name") {
    return { key: "product-name", displayName: "Product Name", priority: 1, category: "PRODUCT_SPECIFICATION" };
  }
  if (/^certifications?$|^certificates?$/.test(normalized)) {
    return { key: "certification", displayName: "Certification", priority: 2, mergeList: true, category: "PRODUCT_SPECIFICATION" };
  }
  if (/^keywords?$/.test(normalized)) {
    return { key: "keywords", displayName: "Keywords", priority: 2, mergeList: true, category: "PRODUCT_SPECIFICATION" };
  }
  if (/^customi[sz](?:ation|able)$/.test(normalized)) {
    return { key: "customization", displayName: "Customization", priority: 2, category: "SUPPLIER_COMMERCIAL" };
  }
  if (/^(?:payment terms?|terms? of payment)$/.test(normalized)) {
    return { key: "payment-terms", displayName: "Payment Terms", priority: 2, mergeList: true, category: "SUPPLIER_COMMERCIAL" };
  }
  if (/^(?:main markets?|export markets?)$/.test(normalized)) {
    return { key: "main-markets", displayName: "Main Markets", priority: 2, mergeList: true, category: "SUPPLIER_COMMERCIAL" };
  }
  if (/^(?:production capacity|annual capacity|annual output)$/.test(normalized)) {
    return { key: "production-capacity", displayName: "Production Capacity", priority: 2, category: "SUPPLIER_COMMERCIAL" };
  }
  return null;
}

function classifyAttribute(attribute: RawProductAttribute, alias: AttributeAlias | null) {
  if (alias?.category) return alias.category;
  if (attribute.category !== "OTHER") return attribute.category;
  const combined = `${attribute.name} ${attribute.value}`;
  if (MARKETPLACE_SERVICE_PATTERN.test(combined)) return "MARKETPLACE_SERVICE" as const;
  if (SUPPLIER_COMMERCIAL_PATTERN.test(attribute.name)) return "SUPPLIER_COMMERCIAL" as const;
  if (PRODUCT_SPECIFICATION_PATTERN.test(attribute.name)) return "PRODUCT_SPECIFICATION" as const;
  return "OTHER" as const;
}

function splitListValues(value: string) {
  return value
    .split(/\s*(?:,|;|\||\n)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeListValues(left: string, right: string) {
  const unique = new Map<string, string>();
  for (const value of [...splitListValues(left), ...splitListValues(right)]) {
    const key = value.toLowerCase().replace(/\s+/g, " ");
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].join(", ").slice(0, 500);
}

function valueQuality(value: string) {
  const tokens = new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return tokens.size * 20 + Math.min(value.length, 300);
}

function normalizeAttributes(attributes: RawProductAttribute[]) {
  const normalized = new Map<
    string,
    { attribute: RawProductAttribute; priority: number; mergeList: boolean }
  >();

  for (const attribute of attributes) {
    if (PACKAGING_ATTRIBUTE_PATTERN.test(attribute.name)) continue;
    const alias = attributeAlias(attribute.name);
    const key = alias?.key ?? normalizedName(attribute.name);
    if (!key) continue;
    const candidate: RawProductAttribute = {
      name: alias?.displayName ?? attribute.name.replace(/\s+/g, " ").trim(),
      value: attribute.value.replace(/\s+/g, " ").trim(),
      category: classifyAttribute(attribute, alias),
    };
    const priority = alias?.priority ?? 1;
    const mergeList = Boolean(alias?.mergeList);
    const existing = normalized.get(key);
    if (!existing) {
      normalized.set(key, { attribute: candidate, priority, mergeList });
      continue;
    }
    if (existing.mergeList || mergeList) {
      existing.attribute.value = mergeListValues(
        existing.attribute.value,
        candidate.value,
      );
      existing.priority = Math.max(existing.priority, priority);
      existing.mergeList = true;
      continue;
    }
    if (
      priority > existing.priority ||
      (priority === existing.priority &&
        valueQuality(candidate.value) > valueQuality(existing.attribute.value))
    ) {
      normalized.set(key, { attribute: candidate, priority, mergeList });
    }
  }

  return [...normalized.values()].map((entry) => entry.attribute).slice(0, 80);
}

function canonicalVariantName(name: string) {
  const normalized = normalizedName(name);
  if (normalized === "colour") return "Color";
  if (normalized === "color") return "Color";
  if (normalized === "voltage") return "Voltage";
  if (normalized === "flow") return "Flow";
  if (/^(?:nozzle|orifice) (?:diameter|size)$/.test(normalized)) {
    return "Nozzle Diameter";
  }
  return name.replace(/\s+/g, " ").trim();
}

function credibleVariantName(name: string) {
  const normalized = name.replace(/\s+/g, " ").trim();
  return SAFE_VARIANT_NAME_PATTERN.test(normalized) &&
    !UNSAFE_VARIANT_NAME_PATTERN.test(normalized);
}

function normalizedUnitValue(value: string) {
  return value
    .replace(",", ".")
    .replace(/\s*\/\s*/g, "/")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function selectableValues(value: string) {
  const unitMatches = [...value.matchAll(REPEATED_UNIT_PATTERN)]
    .map((match) => normalizedUnitValue(match[0]));
  if (unitMatches.length >= 2) return unitMatches;
  return value
    .split(/\s*(?:,|;|\||\/)\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 80);
}

function attributeVariants(attributes: RawProductAttribute[]) {
  return attributes.flatMap((attribute): RawVariant[] => {
    if (!credibleVariantName(attribute.name)) return [];
    const values = selectableValues(attribute.value);
    return values.length >= 2 && values.length <= 30
      ? [{ name: canonicalVariantName(attribute.name), values }]
      : [];
  });
}

function normalizeVariants(variants: RawVariant[], attributes: RawProductAttribute[]) {
  const groups = new Map<string, { name: string; values: Map<string, string> }>();
  for (const variant of [...variants, ...attributeVariants(attributes)]) {
    const name = canonicalVariantName(variant.name);
    if (!credibleVariantName(name)) continue;
    const key = normalizedName(name);
    const group = groups.get(key) ?? { name, values: new Map<string, string>() };
    const rawValues = variant.values.flatMap((value) => selectableValues(value));
    for (const value of rawValues) {
      const cleaned = normalizedUnitValue(value);
      if (!cleaned || cleaned.length > 80) continue;
      const valueKey = cleaned.toLowerCase();
      if (!group.values.has(valueKey)) group.values.set(valueKey, cleaned);
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ name: group.name, values: [...group.values.values()] }))
    .filter((group) => group.values.length >= 2)
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
  rawSupplierOfferMarketplaceDetailsSchema.transform((details) => {
    const attributes = normalizeAttributes(details.attributes);
    return {
      ...details,
      attributes,
      variants: normalizeVariants(details.variants, attributes),
      packaging: normalizePackaging(details.packaging),
    };
  });

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
