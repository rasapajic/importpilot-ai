export type ProductSizeOption = "POCKET" | "BOOK" | "SHOEBOX" | "MICROWAVE" | "LARGER";
export type ProductWeightOption = "UNDER_100G" | "G_100_500" | "KG_0_5_2" | "KG_2_10" | "OVER_10KG";
export type TransportConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TransportMode = "AIR" | "RAIL" | "SEA";

export type SupplierLogisticsData = {
  grossWeightKg?: number | null;
  netWeightKg?: number | null;
  cartonLengthCm?: number | null;
  cartonWidthCm?: number | null;
  cartonHeightCm?: number | null;
  piecesPerCarton?: number | null;
};

export type ProductEstimateInput = {
  productName: string;
  quantity: number;
  sizeOption?: ProductSizeOption | null;
  weightOption?: ProductWeightOption | null;
  supplierLogistics?: SupplierLogisticsData | null;
};

export type ProductLogisticsEstimate = {
  category: string;
  estimatedWeightKg: number;
  estimatedVolumeCbm: number;
  confidence: TransportConfidence;
  reasons: string[];
  source: "SUPPLIER" | "USER_ASSISTED" | "PRODUCT_LOOKUP" | "FALLBACK";
};

export type TransportRouteEstimate = {
  mode: TransportMode;
  estimatedCostEur: number;
  deliveryTimeDays: string;
  confidence: TransportConfidence;
  reasons: string[];
};

const productProfiles = [
  {
    category: "Phone charger",
    keywords: ["phone charger", "charger", "punjac", "punjač", "usb charger", "type c", "typ c"],
    unitWeightKg: 0.08,
    unitVolumeCbm: 0.00035,
  },
  {
    category: "USB cable",
    keywords: ["usb cable", "cable", "kabl", "kabel"],
    unitWeightKg: 0.04,
    unitVolumeCbm: 0.00018,
  },
  {
    category: "Solar panel",
    keywords: ["solar panel", "solarni panel"],
    unitWeightKg: 12,
    unitVolumeCbm: 0.08,
  },
  {
    category: "PTZ camera",
    keywords: ["ptz camera", "ptz kamera", "camera", "kamera"],
    unitWeightKg: 0.8,
    unitVolumeCbm: 0.004,
  },
  {
    category: "LED light",
    keywords: ["led light", "led lamp", "led", "svetlo", "svjetlo"],
    unitWeightKg: 0.35,
    unitVolumeCbm: 0.0025,
  },
  {
    category: "Power tool",
    keywords: ["power tool", "drill", "alat", "bušilica", "busilica"],
    unitWeightKg: 2.2,
    unitVolumeCbm: 0.012,
  },
] as const;

const sizeProfiles: Record<ProductSizeOption, { unitVolumeCbm: number; reason: string }> = {
  POCKET: { unitVolumeCbm: 0.00035, reason: "Product size: fits in pocket." },
  BOOK: { unitVolumeCbm: 0.0012, reason: "Product size: size of a book." },
  SHOEBOX: { unitVolumeCbm: 0.006, reason: "Product size: size of a shoebox." },
  MICROWAVE: { unitVolumeCbm: 0.06, reason: "Product size: microwave sized." },
  LARGER: { unitVolumeCbm: 0.18, reason: "Product size: larger item." },
};

const weightProfiles: Record<ProductWeightOption, { unitWeightKg: number; reason: string }> = {
  UNDER_100G: { unitWeightKg: 0.08, reason: "Item weight: less than 100 g." },
  G_100_500: { unitWeightKg: 0.3, reason: "Item weight: 100-500 g." },
  KG_0_5_2: { unitWeightKg: 1.2, reason: "Item weight: 0.5-2 kg." },
  KG_2_10: { unitWeightKg: 5, reason: "Item weight: 2-10 kg." },
  OVER_10KG: { unitWeightKg: 12, reason: "Item weight: more than 10 kg." },
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampPositive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function findProductProfile(productName: string) {
  const normalized = productName.toLowerCase();
  return productProfiles.find((profile) =>
    profile.keywords.some((keyword) => normalized.includes(keyword)),
  );
}

function supplierEstimate(quantity: number, supplier?: SupplierLogisticsData | null) {
  if (!supplier) return null;
  const piecesPerCarton = clampPositive(supplier.piecesPerCarton ?? 0);
  const cartonWeight = clampPositive(supplier.grossWeightKg ?? supplier.netWeightKg ?? 0);
  const length = clampPositive(supplier.cartonLengthCm ?? 0);
  const width = clampPositive(supplier.cartonWidthCm ?? 0);
  const height = clampPositive(supplier.cartonHeightCm ?? 0);

  if (!piecesPerCarton || !cartonWeight || !length || !width || !height) return null;

  const cartonCount = Math.ceil(quantity / piecesPerCarton);
  return {
    estimatedWeightKg: round(cartonWeight * cartonCount, 2),
    estimatedVolumeCbm: round((length * width * height / 1_000_000) * cartonCount, 3),
  };
}

export function estimateProductLogistics(input: ProductEstimateInput): ProductLogisticsEstimate {
  const supplier = supplierEstimate(input.quantity, input.supplierLogistics);
  if (supplier) {
    return {
      category: "Supplier data",
      ...supplier,
      confidence: "HIGH",
      reasons: ["Supplier provided weight and carton dimensions."],
      source: "SUPPLIER",
    };
  }

  const profile = findProductProfile(input.productName);
  const size = input.sizeOption ? sizeProfiles[input.sizeOption] : null;
  const weight = input.weightOption ? weightProfiles[input.weightOption] : null;
  const unitWeightKg = weight?.unitWeightKg ?? profile?.unitWeightKg ?? 0.6;
  const unitVolumeCbm = size?.unitVolumeCbm ?? profile?.unitVolumeCbm ?? 0.004;
  const reasons = [
    profile ? `Matched product category: ${profile.category}.` : "No exact product category match.",
    size?.reason,
    weight?.reason,
  ].filter((reason): reason is string => Boolean(reason));
  const confidence: TransportConfidence =
    size && weight ? "HIGH" : profile && (size || weight) ? "MEDIUM" : profile ? "MEDIUM" : "LOW";

  return {
    category: profile?.category ?? "General product",
    estimatedWeightKg: round(unitWeightKg * input.quantity, 2),
    estimatedVolumeCbm: round(unitVolumeCbm * input.quantity, 3),
    confidence,
    reasons,
    source: size || weight ? "USER_ASSISTED" : profile ? "PRODUCT_LOOKUP" : "FALLBACK",
  };
}

function routeConfidence(base: TransportConfidence, mode: TransportMode, estimate: ProductLogisticsEstimate) {
  if (base === "LOW") return "LOW";
  if (mode === "SEA" && estimate.estimatedVolumeCbm < 0.3) return "LOW";
  if (mode === "AIR" && estimate.estimatedWeightKg > 300) return "LOW";
  return base;
}

export function estimateTransportRoutes(estimate: ProductLogisticsEstimate): TransportRouteEstimate[] {
  const chargeableAirKg = Math.max(estimate.estimatedWeightKg, estimate.estimatedVolumeCbm * 167);
  const railBase = Math.max(estimate.estimatedWeightKg * 0.9, estimate.estimatedVolumeCbm * 120);
  const seaBase = Math.max(estimate.estimatedWeightKg * 0.28, estimate.estimatedVolumeCbm * 85);

  const routes: Array<{ mode: TransportMode; cost: number; days: string; reason: string }> = [
    { mode: "AIR", cost: 65 + chargeableAirKg * 5.5, days: "7-10", reason: "Fastest option, priced by chargeable weight." },
    { mode: "RAIL", cost: 80 + railBase, days: "20-30", reason: "Balanced option for Europe." },
    { mode: "SEA", cost: 120 + seaBase, days: "35-50", reason: "Cheapest for larger volume, slower delivery." },
  ];

  return routes.map((route) => ({
    mode: route.mode,
    estimatedCostEur: Math.ceil(route.cost / 5) * 5,
    deliveryTimeDays: route.days,
    confidence: routeConfidence(estimate.confidence, route.mode, estimate),
    reasons: [route.reason, ...estimate.reasons].slice(0, 3),
  }));
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function extractSupplierLogisticsData(metadata: unknown): SupplierLogisticsData | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const nested = typeof record.logistics === "object" && record.logistics !== null && !Array.isArray(record.logistics)
    ? { ...record, ...(record.logistics as Record<string, unknown>) }
    : record;

  const data: SupplierLogisticsData = {
    grossWeightKg: readNumber(nested, ["grossWeightKg", "gross_weight_kg", "grossWeight", "gross_weight"]),
    netWeightKg: readNumber(nested, ["netWeightKg", "net_weight_kg", "netWeight", "net_weight"]),
    cartonLengthCm: readNumber(nested, ["cartonLengthCm", "carton_length_cm", "lengthCm"]),
    cartonWidthCm: readNumber(nested, ["cartonWidthCm", "carton_width_cm", "widthCm"]),
    cartonHeightCm: readNumber(nested, ["cartonHeightCm", "carton_height_cm", "heightCm"]),
    piecesPerCarton: readNumber(nested, ["piecesPerCarton", "pieces_per_carton", "pcsPerCarton"]),
  };

  return Object.values(data).some((value) => value !== null && value !== undefined) ? data : null;
}
