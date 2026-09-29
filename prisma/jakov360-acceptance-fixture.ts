import type { SupplierOfferSearchResult } from "../modules/product-search/domain/search";
import { generateRfqMessage } from "../modules/product-search/domain/rfq";
import { CostEvidenceStatuses, VatTreatments } from "../modules/cost-engine/domain/cost-evidence";

export const JAKOV360_ACCEPTANCE_PROJECT_ID = "36000000-0000-4000-8000-000000000001";
export const JAKOV360_CHARGERS_PROJECT_ID = "36000000-0000-4000-8000-000000000002";
export const JAKOV360_ACCEPTANCE_PROJECT_NAME = "JAKOV360 Acceptance pregled — Zaštitne naočare";
export const JAKOV360_CHARGERS_PROJECT_NAME = "JAKOV360 Acceptance pregled — USB-C punjači";
export const JAKOV360_DEMO_EMAIL = "owner@tradepilot.local";
export const JAKOV360_DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
export const JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME = "jakov360_acceptance_staging";

export type AcceptanceSeedEnvironment = {
  nodeEnv?: string;
  databaseUrl?: string;
  explicitConfirmation?: string;
  stagingSafetyConfirmation?: string;
};

export type AcceptanceOfferFixture = {
  id: string;
  supplierName: string;
  supplierCountry: string | null;
  moq: number | null;
  unitPrice: string | null;
  currency: string | null;
  incoterm: string | null;
  sourceMetadata: Record<string, unknown>;
};

export type AcceptanceSearchCacheFixture = {
  id: string;
  query: string;
  quantity: number;
  targetCountry: string;
  results: SupplierOfferSearchResult[];
};

const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const renderDatabaseHostPattern = /^dpg-[a-z0-9-]+(?:\.[a-z0-9-]+\.render\.com)?$/i;

export function assertJakov360AcceptanceSeedAllowed(environment: AcceptanceSeedEnvironment) {
  if (environment.explicitConfirmation !== "1") {
    throw new Error("Set JAKOV360_ACCEPTANCE_SEED=1 to confirm the local acceptance seed.");
  }
  if (!environment.databaseUrl) {
    throw new Error("DATABASE_URL is required for the JAKOV360 acceptance seed.");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
    throw new Error("JAKOV360 acceptance seed supports PostgreSQL only.");
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!databaseName) throw new Error("DATABASE_URL must include a database name.");
  if (/(^|[-_])(prod|production|live)([-_]|$)/i.test(databaseName)) {
    throw new Error(`Refusing production-like database name: ${databaseName}`);
  }

  if (localDatabaseHosts.has(databaseUrl.hostname)) {
    if (environment.nodeEnv !== "development" && environment.nodeEnv !== "test") {
      throw new Error("JAKOV360 acceptance seed requires NODE_ENV=development or test.");
    }
    return { databaseHost: databaseUrl.hostname, databaseName };
  }

  if (environment.stagingSafetyConfirmation !== "1") {
    if (environment.nodeEnv === "development" || environment.nodeEnv === "test") {
      throw new Error(`Refusing non-local database host: ${databaseUrl.hostname}`);
    }
    throw new Error("Set JAKOV360_ACCEPTANCE_STAGING_SEED=1 to confirm the Render staging seed.");
  }
  if (environment.nodeEnv !== "production") {
    throw new Error("JAKOV360 Render staging seed requires NODE_ENV=production.");
  }
  if (!renderDatabaseHostPattern.test(databaseUrl.hostname)) {
    throw new Error(`Refusing non-Render database host: ${databaseUrl.hostname}`);
  }
  if (databaseName !== JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME) {
    throw new Error(`Refusing unexpected staging database name: ${databaseName}`);
  }
  if (!databaseName.includes("staging") || !databaseName.includes("acceptance")) {
    throw new Error(`Refusing unsafe staging database name: ${databaseName}`);
  }

  return { databaseHost: databaseUrl.hostname, databaseName };
}

export function buildJakov360AcceptanceSeedPlan() {
  const quantityTiers = [
    { minQuantity: 12, maxQuantity: 499, price: 1.14, currency: "EUR", confirmed: true },
    { minQuantity: 500, maxQuantity: 1199, price: 0.964, currency: "EUR", confirmed: true },
    { minQuantity: 1200, maxQuantity: 4999, price: 0.86, currency: "EUR", confirmed: true },
    { minQuantity: 5000, maxQuantity: null, price: null, currency: null, confirmed: false },
  ] satisfies NonNullable<SupplierOfferSearchResult["quantityTiers"]>;

  const glasses: SupplierOfferSearchResult = {
    title: "Zaštitne naočare — JAKOV360 acceptance primer",
    supplierName: "Shenzhen Vision Safety",
    supplierCountry: "CN",
    price: 0.964,
    currency: "EUR",
    minimumOrderQuantity: 500,
    incoterm: "FOB",
    productUrl: "https://supplier.example/jakov360/safety-glasses",
    imageUrl: "/jakov360-acceptance-glasses.svg",
    source: "Made-in-China acceptance fixture",
    rfqProductNameEn: "Protective safety glasses — direct import",
    offerType: "DIRECT_IMPORT",
    sellerCountry: "CN",
    originCountry: "CN",
    availabilityConfirmed: true,
    b2bPriceConfirmed: true,
    quantityTiers,
  };

  const dudi: SupplierOfferSearchResult = {
    title: "Dudi Co. USB-C punjač — retail primer za 100 kom",
    supplierName: "Dudi Co.",
    supplierCountry: "RS",
    price: 1099,
    currency: "RSD",
    minimumOrderQuantity: 100,
    incoterm: null,
    productUrl: "https://domestic-supplier.example/jakov360/usb-c-charger",
    imageUrl: null,
    source: "Dudi Co.",
    offerType: "DOMESTIC",
    sellerCountry: "RS",
    originCountry: "CN",
    importerName: "Dudi Co.",
    priceIncludesVat: true,
    netPrice: 916,
    availabilityConfirmed: false,
    b2bPriceConfirmed: false,
  };

  const directImport: SupplierOfferSearchResult = {
    title: "USB-C PD 20W punjač — direktan uvoz",
    supplierName: "Dongguan Power Export",
    supplierCountry: "CN",
    price: 1.38,
    currency: "EUR",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.example/jakov360/usb-c-pd-charger",
    imageUrl: "/jakov360-acceptance-usb-c-charger.svg",
    source: "Alibaba acceptance fixture",
    rfqProductNameEn: "USB-C PD 20W charger — direct import",
    offerType: "DIRECT_IMPORT",
    sellerCountry: "CN",
    originCountry: "CN",
    availabilityConfirmed: true,
    b2bPriceConfirmed: true,
  };

  const unknown: SupplierOfferSearchResult = {
    title: "USB-C punjač — nepotpun izvor",
    supplierName: "Nepotvrđen prodavac",
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl: "https://supplier.example/jakov360/unconfirmed-charger",
    imageUrl: "/jakov360-acceptance-missing-image.svg",
    source: "Acceptance fixture",
    offerType: "UNKNOWN",
    availabilityConfirmed: false,
    b2bPriceConfirmed: false,
  };

  const customsProvenance = {
    sourceName: "Uprava carina Republike Srbije — TARIS",
    officialUrl: "https://www.carina.rs/sr/privreda/tarifski-poslovi/taris.html",
    checkedAt: "2026-06-14",
    validFrom: null,
    tariffCode: "9004",
    originCountry: "CN",
    shippingCountry: "CN",
    rateType: "unknown",
    confirmedByOfficialSource: false,
    classificationSuggested: true,
  } as const;

  const rfqExamples = {
    sample: generateRfqMessage({
      productTitle: glasses.title,
      rfqProductName: glasses.rfqProductNameEn,
      supplierName: glasses.supplierName,
      quantity: 1000,
      deliveryCountry: "RS",
      deliveryCity: "Beograd",
      postalCode: "11000",
      orderType: "SAMPLE",
      incoterm: glasses.incoterm,
      productUrl: glasses.productUrl,
    }),
    fullOrder: generateRfqMessage({
      productTitle: glasses.title,
      rfqProductName: glasses.rfqProductNameEn,
      supplierName: glasses.supplierName,
      quantity: 1000,
      deliveryCountry: "RS",
      deliveryCity: "Beograd",
      postalCode: "11000",
      orderType: "FULL_ORDER",
      incoterm: glasses.incoterm,
      productUrl: glasses.productUrl,
    }),
  };

  const glassesOffer: AcceptanceOfferFixture = {
    id: "36000000-0000-4000-8000-000000000010",
    supplierName: glasses.supplierName,
    supplierCountry: glasses.supplierCountry,
    moq: glasses.minimumOrderQuantity,
    unitPrice: glasses.price?.toString() ?? null,
    currency: glasses.currency,
    incoterm: glasses.incoterm,
    sourceMetadata: {
      title: glasses.title,
      searchProductName: "Zaštitne naočare",
      productUrl: glasses.productUrl,
      imageUrl: glasses.imageUrl,
      providerSource: glasses.source,
      rfqProductNameEn: glasses.rfqProductNameEn,
      offerType: glasses.offerType,
      sellerCountry: glasses.sellerCountry,
      originCountry: glasses.originCountry,
      availabilityConfirmed: glasses.availabilityConfirmed,
      b2bPriceConfirmed: glasses.b2bPriceConfirmed,
      quantityTiers,
      requestedQuantity: 1000,
      customsProvenance,
      acceptanceRfqExamples: rfqExamples,
    },
  };
  const chargerOffers: AcceptanceOfferFixture[] = [
    {
      id: "36000000-0000-4000-8000-000000000020",
      supplierName: dudi.supplierName,
      supplierCountry: dudi.supplierCountry,
      moq: dudi.minimumOrderQuantity,
      unitPrice: dudi.price?.toString() ?? null,
      currency: dudi.currency,
      incoterm: null,
      sourceMetadata: {
        title: dudi.title,
        searchProductName: "USB-C PD 20W punjač",
        productUrl: dudi.productUrl,
        imageUrl: dudi.imageUrl,
        providerSource: dudi.source,
        offerType: dudi.offerType,
        sellerCountry: dudi.sellerCountry,
        originCountry: dudi.originCountry,
        importerName: dudi.importerName,
        priceIncludesVat: true,
        netPrice: 916,
        availabilityConfirmed: false,
        b2bPriceConfirmed: false,
        requestedQuantity: 100,
        retailPriceOnly: true,
      },
    },
    {
      id: "36000000-0000-4000-8000-000000000030",
      supplierName: directImport.supplierName,
      supplierCountry: directImport.supplierCountry,
      moq: directImport.minimumOrderQuantity,
      unitPrice: directImport.price?.toString() ?? null,
      currency: directImport.currency,
      incoterm: directImport.incoterm,
      sourceMetadata: {
        title: directImport.title,
        searchProductName: "USB-C PD 20W punjač",
        productUrl: directImport.productUrl,
        imageUrl: directImport.imageUrl,
        providerSource: directImport.source,
        rfqProductNameEn: directImport.rfqProductNameEn,
        offerType: directImport.offerType,
        sellerCountry: directImport.sellerCountry,
        originCountry: directImport.originCountry,
        availabilityConfirmed: true,
        b2bPriceConfirmed: true,
      },
    },
    {
      id: "36000000-0000-4000-8000-000000000040",
      supplierName: unknown.supplierName,
      supplierCountry: null,
      moq: null,
      unitPrice: null,
      currency: null,
      incoterm: null,
      sourceMetadata: {
        title: unknown.title,
        searchProductName: "USB-C PD 20W punjač",
        productUrl: unknown.productUrl,
        imageUrl: unknown.imageUrl,
        providerSource: unknown.source,
        offerType: "UNKNOWN",
        availabilityConfirmed: false,
        b2bPriceConfirmed: false,
      },
    },
  ];

  const glassesCalculation = {
    id: "36000000-0000-4000-8000-000000000200",
    targetCountry: "RS",
    quantity: 1000,
    unitPrice: "0.964",
    currency: "EUR",
    incoterm: "FOB",
    shippingCost: null,
    insuranceCost: null,
    customsDutyRate: null,
    customsDutyAmount: null,
    vatRate: "20",
    vatAmount: null,
    freightForwardingCost: null,
    storageCost: null,
    inspectionCost: null,
    otherCosts: null,
    knownCostTotal: "964.00",
    landedCostTotal: null,
    landedCostPerUnit: null,
    targetSellingPrice: "4.00",
    grossMarginPercent: null,
    breakEvenPrice: null,
    requiredCashTotal: null,
    netAcquisitionCost: null,
    vatTreatment: VatTreatments.UNSURE,
    costEvidence: {
      goods: { status: CostEvidenceStatuses.CONFIRMED, value: "0.964" },
      shipping: { status: CostEvidenceStatuses.UNKNOWN, value: null },
      insurance: { status: CostEvidenceStatuses.UNKNOWN, value: null },
      customsDutyRate: { status: CostEvidenceStatuses.UNKNOWN, value: null },
      vatRate: { status: CostEvidenceStatuses.ESTIMATED, value: "20" },
      freightForwarding: { status: CostEvidenceStatuses.UNKNOWN, value: null },
      storage: { status: CostEvidenceStatuses.NOT_APPLICABLE, value: null },
      inspection: { status: CostEvidenceStatuses.NOT_APPLICABLE, value: null },
      other: { status: CostEvidenceStatuses.UNKNOWN, value: null },
      vatTreatment: VatTreatments.UNSURE,
    },
  };

  const searchCaches: AcceptanceSearchCacheFixture[] = [
    { id: "36000000-0000-4000-8000-000000000100", query: "Zaštitne naočare", quantity: 1000, targetCountry: "RS", results: [glasses] },
    { id: "36000000-0000-4000-8000-000000000110", query: "USB-C PD 20W punjač", quantity: 100, targetCountry: "RS", results: [dudi, directImport, unknown] },
  ];

  return {
    projects: [
      {
        project: { id: JAKOV360_ACCEPTANCE_PROJECT_ID, name: JAKOV360_ACCEPTANCE_PROJECT_NAME, targetCountry: "RS", quantity: 1000, targetMargin: 30 },
        offers: [glassesOffer],
        calculations: [{ ...glassesCalculation, offerId: glassesOffer.id }],
      },
      {
        project: { id: JAKOV360_CHARGERS_PROJECT_ID, name: JAKOV360_CHARGERS_PROJECT_NAME, targetCountry: "RS", quantity: 100, targetMargin: 25 },
        offers: chargerOffers,
        calculations: [],
      },
    ],
    project: { id: JAKOV360_ACCEPTANCE_PROJECT_ID, name: JAKOV360_ACCEPTANCE_PROJECT_NAME, targetCountry: "RS", quantity: 1000, targetMargin: 30 },
    offers: [glassesOffer, ...chargerOffers],
    glassesOfferId: glassesOffer.id,
    glassesCalculation,
    searchCaches,
    rfqExamples,
  };
}
