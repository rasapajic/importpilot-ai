import {
  CalculationStatus,
  OfferExtractionStatus,
  ProjectActivityType,
  SupplierOfferSource,
} from "@prisma/client";
import { prisma } from "../../../lib/database/prisma";
import { recordAiUsageEvents } from "../../ai-usage/application/ai-usage-service";
import {
  projectSupplierSearchRequestSchema,
  supplierOfferLogisticsSchema,
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type ProjectSupplierSearchRequest,
  type SupplierOfferLogistics,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchResult,
  type SupplierOfferUrlImportProvider,
} from "../domain/search";
import {
  applyLunaSearchConstraints,
  buildLunaProviderSearchInput,
  createLunaSearchPlan,
} from "../domain/luna-search-plan";
import { rankPreliminarySupplierOffers } from "../domain/preliminary-supplier-ranking";
import {
  analyzeAndRankTajaCandidates,
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "../domain/taja-candidate-analysis";
import { mergeTajaCandidateEnrichment } from "../domain/taja-candidate-enrichment";
import { estimateTajaPreliminaryLandedCost } from "../domain/taja-preliminary-cost-estimate";
import { applyTajaProductFormPolicy } from "../domain/taja-product-form-policy";
import { canonicalSupplierProductUrl } from "../domain/supplier-product-url";
import {
  createBrowserAssisted1688Preview,
  createSupplierOfferSourceMetadata,
} from "../domain/source-provenance";
import {
  findLastSuccessfulSupplierSearch,
  storeSuccessfulSupplierSearch,
} from "../infrastructure/persistent-cache";
import { getSupplierOfferSearchProvider } from "../infrastructure/provider";
import { getSupplierOfferUrlImportProvider } from "../infrastructure/url-import-provider";
import { recordProjectActivity } from "../../timeline/application/timeline-service";
import { extractSupplierLogisticsData } from "../../transport/domain/transport-estimator";
import { autoEnrichTajaCandidates } from "./taja-auto-enrichment";
import { searchSupplierOffersWithPersistentFallback } from "./search-fallback";

export class ProductSearchProjectNotFoundError extends Error {}

export class DuplicateSupplierOfferUrlError extends Error {
  constructor(readonly existingOfferId: string) {
    super("Ponuda sa istim izvornim linkom je već dodata u projekat.");
  }
}

type EffectiveProjectSupplierSearchRequest = ProjectSupplierSearchRequest & {
  targetMarginPercent: number;
};

type SearchResultOrigin = "live" | "cache" | null;

type SearchPresentationInput = {
  projectId: string;
  organizationId: string;
  effectiveRequest: EffectiveProjectSupplierSearchRequest;
  lunaPlan: ReturnType<typeof createLunaSearchPlan>;
  sourceResults: SupplierOfferSearchResult[];
  resultOrigin: SearchResultOrigin;
  fetchedAt: string;
  urlImportProvider?: SupplierOfferUrlImportProvider;
};

function developmentLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({ service: "importpilot-app", event, ...details }));
}

function sourceMetadataProductUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const productUrl = (metadata as Record<string, unknown>).productUrl;
  return typeof productUrl === "string" && productUrl.trim() ? productUrl : null;
}

function sourceMetadataSupplierLogistics(
  metadata: unknown,
): SupplierOfferLogistics | undefined {
  const extracted = extractSupplierLogisticsData(metadata);
  if (!extracted) return undefined;
  const parsed = supplierOfferLogisticsSchema.safeParse(extracted);
  return parsed.success ? parsed.data : undefined;
}

function landedCostStatus(status: CalculationStatus | undefined) {
  if (status === CalculationStatus.CALCULATED) return TajaLandedCostStatuses.CONFIRMED;
  if (status === CalculationStatus.DRAFT || status === CalculationStatus.NEEDS_REVIEW) {
    return TajaLandedCostStatuses.ESTIMATED;
  }
  return TajaLandedCostStatuses.UNAVAILABLE;
}

function offerCandidateEnrichment(offer: {
  supplierVerified: boolean | null;
  yearsOnPlatform: number | null;
  responseRatePercent: { toNumber(): number } | null;
  transactionCount: number | null;
  employeeCount: number | null;
  profileCompletenessScore: number | null;
  deliveryTimeDays: number | null;
  sampleAvailable: boolean | null;
  termsClarityScore: number | null;
  shippingClarityScore: number | null;
  costCalculations: Array<{
    unitPrice: { toNumber(): number };
    currency: string;
    incoterm: string;
    landedCostPerUnit: { toNumber(): number };
    grossMarginPercent: { toNumber(): number };
    calculationStatus: CalculationStatus;
  }>;
}): TajaCandidateEnrichment {
  const cost = offer.costCalculations[0];
  return {
    supplierVerified: offer.supplierVerified,
    yearsOnPlatform: offer.yearsOnPlatform,
    responseRatePercent: offer.responseRatePercent?.toNumber() ?? null,
    transactionCount: offer.transactionCount,
    employeeCount: offer.employeeCount,
    profileCompletenessScore: offer.profileCompletenessScore,
    deliveryTimeDays: offer.deliveryTimeDays,
    sampleAvailable: offer.sampleAvailable,
    termsClarityScore: offer.termsClarityScore,
    shippingClarityScore: offer.shippingClarityScore,
    landedCostPerUnit: cost?.landedCostPerUnit.toNumber() ?? null,
    grossMarginPercent: cost?.grossMarginPercent.toNumber() ?? null,
    landedCostStatus: landedCostStatus(cost?.calculationStatus),
    landedCostUnitPrice: cost?.unitPrice.toNumber() ?? null,
    landedCostCurrency: cost?.currency ?? null,
    landedCostIncoterm: cost?.incoterm ?? null,
  };
}

type StoredCandidateContext = {
  enrichment: TajaCandidateEnrichment;
  supplierLogistics?: SupplierOfferLogistics;
};

async function findCandidateContext(
  projectId: string,
  organizationId: string,
  targetCountry: string,
  quantity: number,
): Promise<Map<string, StoredCandidateContext>> {
  const offers = await prisma.supplierOffer.findMany({
    where: {
      projectId,
      organizationId,
      source: SupplierOfferSource.SEARCH_RESULT,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      costCalculations: {
        where: { targetCountry, quantity },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const contexts = new Map<string, StoredCandidateContext>();
  for (const offer of offers) {
    const productUrl = sourceMetadataProductUrl(offer.sourceMetadata);
    if (!productUrl) continue;
    const key = canonicalSupplierProductUrl(productUrl);
    const existing = contexts.get(key);
    const supplierLogistics = existing?.supplierLogistics ??
      sourceMetadataSupplierLogistics(offer.sourceMetadata);
    contexts.set(key, {
      enrichment: mergeTajaCandidateEnrichment(
        existing?.enrichment,
        offerCandidateEnrichment(offer),
      ),
      ...(supplierLogistics ? { supplierLogistics } : {}),
    });
  }
  return contexts;
}

async function findExistingSearchResultOffer(
  projectId: string,
  organizationId: string,
  productUrl: string,
) {
  const canonicalUrl = canonicalSupplierProductUrl(productUrl);
  const offers = await prisma.supplierOffer.findMany({
    where: {
      organizationId,
      projectId,
      source: SupplierOfferSource.SEARCH_RESULT,
    },
    select: { id: true, sourceMetadata: true },
  });

  return offers.find((offer) => {
    const existingUrl = sourceMetadataProductUrl(offer.sourceMetadata);
    return existingUrl !== null &&
      canonicalSupplierProductUrl(existingUrl) === canonicalUrl;
  }) ?? null;
}

async function findSearchProject(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, targetMargin: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();
  return project;
}

function effectiveSearchRequest(
  project: Awaited<ReturnType<typeof findSearchProject>>,
  searchInput: unknown,
): EffectiveProjectSupplierSearchRequest {
  const request = projectSupplierSearchRequestSchema.parse(searchInput);
  return {
    ...request,
    targetMarginPercent: request.targetMarginPercent ?? Number(project.targetMargin.toString()),
  };
}

async function buildSearchPresentation(input: SearchPresentationInput) {
  const {
    projectId,
    organizationId,
    effectiveRequest,
    lunaPlan,
    sourceResults,
    resultOrigin,
    fetchedAt,
    urlImportProvider,
  } = input;
  const constrainedResults = applyLunaSearchConstraints(sourceResults, effectiveRequest);
  const preliminaryResults = rankPreliminarySupplierOffers(constrainedResults, {
    quantity: effectiveRequest.quantity,
    productQuery: effectiveRequest.query,
  });

  let candidateResults = preliminaryResults;
  let autoEnrichmentSummary: Awaited<
    ReturnType<typeof autoEnrichTajaCandidates>
  >["summary"] | undefined;
  if (urlImportProvider) {
    const autoEnrichment = await autoEnrichTajaCandidates(
      preliminaryResults,
      urlImportProvider,
      { maxCandidates: 10, concurrency: 4 },
    );
    candidateResults = autoEnrichment.results;
    autoEnrichmentSummary = autoEnrichment.summary;
  }

  const candidateContext = await findCandidateContext(
    projectId,
    organizationId,
    effectiveRequest.targetCountry,
    effectiveRequest.quantity,
  );
  const tajaAnalysis = analyzeAndRankTajaCandidates(
    candidateResults.map((result) => {
      const stored = candidateContext.get(
        canonicalSupplierProductUrl(result.productUrl),
      );
      const resultWithStoredLogistics = result.supplierLogistics ||
          !stored?.supplierLogistics
        ? result
        : { ...result, supplierLogistics: stored.supplierLogistics };
      return {
        result: resultWithStoredLogistics,
        enrichment: stored?.enrichment,
        preliminaryCostEstimate: estimateTajaPreliminaryLandedCost({
          result: resultWithStoredLogistics,
          quantity: effectiveRequest.quantity,
          targetCountry: effectiveRequest.targetCountry,
          targetMarginPercent: effectiveRequest.targetMarginPercent,
        }),
      };
    }),
    {
      quantity: effectiveRequest.quantity,
      targetMarginPercent: effectiveRequest.targetMarginPercent,
      productQuery: effectiveRequest.query,
    },
  );
  const productFormAnalysis = applyTajaProductFormPolicy({
    rankedResults: tajaAnalysis.rankedResults,
    analyses: tajaAnalysis.analyses,
    productQuery: effectiveRequest.query,
  });
  const results = productFormAnalysis.rankedResults.map((result) => ({
    ...result,
    provenance: {
      fetchedAt,
      resultOrigin: resultOrigin ?? "live",
      originalQuery: effectiveRequest.query,
      providerQuery: lunaPlan.providerQuery,
      chinese1688Query: lunaPlan.chinese1688Query,
      targetCountry: effectiveRequest.targetCountry,
      quantity: effectiveRequest.quantity,
    },
  }));

  return {
    results,
    candidateAnalyses: productFormAnalysis.analyses,
    ...(autoEnrichmentSummary ? { autoEnrichmentSummary } : {}),
    unfilteredResultCount: sourceResults.length,
    lunaPlan,
    fetchedAt,
  };
}

export async function searchProjectSupplierOffers(
  projectId: string,
  organizationId: string,
  searchInput: unknown,
  provider?: SupplierOfferSearchProvider,
  urlImportProvider: SupplierOfferUrlImportProvider = getSupplierOfferUrlImportProvider(),
) {
  const project = await findSearchProject(projectId, organizationId);
  const activeProvider = provider ?? getSupplierOfferSearchProvider({
    onAiUsage: async (events) => {
      await recordAiUsageEvents({ organizationId, projectId: project.id, events });
    },
  });
  const effectiveRequest = effectiveSearchRequest(project, searchInput);
  const lunaPlan = createLunaSearchPlan(effectiveRequest);
  const providerInput = supplierOfferSearchInputSchema.parse(
    buildLunaProviderSearchInput(lunaPlan, effectiveRequest),
  );
  const outcome = await searchSupplierOffersWithPersistentFallback(providerInput, activeProvider);
  const presentation = await buildSearchPresentation({
    projectId,
    organizationId,
    effectiveRequest,
    lunaPlan,
    sourceResults: outcome.results,
    resultOrigin: outcome.resultOrigin,
    fetchedAt: new Date().toISOString(),
    urlImportProvider,
  });

  if (outcome.resultOrigin === "live" && presentation.results.length > 0) {
    await storeSuccessfulSupplierSearch(providerInput, presentation.results).catch((error: unknown) => {
      developmentLog("supplier_search_final_cache_write_failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return {
    ...outcome,
    ...presentation,
  };
}

/**
 * Restores the last successful result set from the persistent cache and runs
 * only deterministic local ranking and analysis. It never calls the live
 * supplier-search provider or records a paid AI search event.
 */
export async function loadCachedProjectSupplierOffers(
  projectId: string,
  organizationId: string,
  searchInput: unknown,
) {
  const project = await findSearchProject(projectId, organizationId);
  const effectiveRequest = effectiveSearchRequest(project, searchInput);
  const lunaPlan = createLunaSearchPlan(effectiveRequest);
  const providerInput = supplierOfferSearchInputSchema.parse(
    buildLunaProviderSearchInput(lunaPlan, effectiveRequest),
  );
  const cached = await findLastSuccessfulSupplierSearch(providerInput);
  if (!cached) return null;

  const presentation = await buildSearchPresentation({
    projectId,
    organizationId,
    effectiveRequest,
    lunaPlan,
    sourceResults: cached.results,
    resultOrigin: "cache",
    fetchedAt: cached.createdAt.toISOString(),
  });

  return {
    ...presentation,
    resultOrigin: "cache" as const,
    cacheHit: true,
    returnedFromCache: true,
    liveProviderFailed: false,
  };
}

export async function importSearchResult(
  projectId: string,
  organizationId: string,
  input: SupplierOfferSearchResult,
) {
  const result = supplierOfferSearchResultsSchema.element.parse(input);
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const existingOffer = await findExistingSearchResultOffer(
    projectId,
    organizationId,
    result.productUrl,
  );
  if (existingOffer) throw new DuplicateSupplierOfferUrlError(existingOffer.id);

  const sourceMetadata = createSupplierOfferSourceMetadata(result);

  return prisma.$transaction(async (transaction) => {
    const offer = await transaction.supplierOffer.create({
      data: {
        organizationId,
        projectId,
        supplierName: result.supplierName,
        supplierCountry: result.supplierCountry,
        moq: result.minimumOrderQuantity,
        unitPrice: result.price,
        currency: result.currency,
        incoterm: result.incoterm,
        extractionStatus: OfferExtractionStatus.MANUAL,
        source: SupplierOfferSource.SEARCH_RESULT,
        sourceMetadata,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.OFFER_ADDED,
      title: "Ponuda iz pretrage je dodata",
      description: offer.supplierName,
      metadata: {
        offerId: offer.id,
        supplierName: offer.supplierName,
        source: result.source,
        sourceHost: sourceMetadata.sourceHost,
        fetchedAt: sourceMetadata.fetchedAt,
        resultOrigin: sourceMetadata.resultOrigin,
      },
    });
    return offer;
  });
}

export async function previewProjectSupplierOfferUrl(
  projectId: string,
  organizationId: string,
  productUrl: string,
  provider: SupplierOfferUrlImportProvider = getSupplierOfferUrlImportProvider(),
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const browserAssisted1688Preview = createBrowserAssisted1688Preview(productUrl);
  if (browserAssisted1688Preview) return browserAssisted1688Preview;

  return provider.previewSupplierOfferUrl(productUrl);
}
