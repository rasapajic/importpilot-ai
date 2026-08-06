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
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchResult,
  type SupplierOfferUrlImportProvider,
} from "../domain/search";
import {
  applyLunaSearchConstraints,
  buildLunaProviderSearchInput,
  createLunaSearchPlan,
} from "../domain/luna-search-plan";
import {
  analyzeAndRankTajaCandidates,
  TajaLandedCostStatuses,
  type TajaCandidateEnrichment,
} from "../domain/taja-candidate-analysis";
import { selectPreferredTajaCandidateEnrichment } from "../domain/taja-candidate-enrichment";
import { canonicalSupplierProductUrl } from "../domain/supplier-product-url";
import {
  createBrowserAssisted1688Preview,
  createSupplierOfferSourceMetadata,
} from "../domain/source-provenance";
import { getSupplierOfferSearchProvider } from "../infrastructure/provider";
import { getSupplierOfferUrlImportProvider } from "../infrastructure/url-import-provider";
import { recordProjectActivity } from "../../timeline/application/timeline-service";
import { searchSupplierOffersWithPersistentFallback } from "./search-fallback";

export class ProductSearchProjectNotFoundError extends Error {}

export class DuplicateSupplierOfferUrlError extends Error {
  constructor(readonly existingOfferId: string) {
    super("Ponuda sa istim izvornim linkom je već dodata u projekat.");
  }
}

function sourceMetadataProductUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const productUrl = (metadata as Record<string, unknown>).productUrl;
  return typeof productUrl === "string" && productUrl.trim() ? productUrl : null;
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
  };
}

async function findCandidateEnrichment(
  projectId: string,
  organizationId: string,
): Promise<Map<string, TajaCandidateEnrichment>> {
  const offers = await prisma.supplierOffer.findMany({
    where: {
      projectId,
      organizationId,
      source: SupplierOfferSource.SEARCH_RESULT,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      costCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const enrichment = new Map<string, TajaCandidateEnrichment>();
  for (const offer of offers) {
    const productUrl = sourceMetadataProductUrl(offer.sourceMetadata);
    if (!productUrl) continue;
    const key = canonicalSupplierProductUrl(productUrl);
    const candidate = offerCandidateEnrichment(offer);
    enrichment.set(
      key,
      selectPreferredTajaCandidateEnrichment(enrichment.get(key), candidate),
    );
  }
  return enrichment;
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

export async function searchProjectSupplierOffers(
  projectId: string,
  organizationId: string,
  searchInput: unknown,
  provider?: SupplierOfferSearchProvider,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, targetMargin: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const activeProvider = provider ?? getSupplierOfferSearchProvider({
    onAiUsage: async (events) => {
      await recordAiUsageEvents({ organizationId, projectId: project.id, events });
    },
  });
  const request = projectSupplierSearchRequestSchema.parse(searchInput);
  const effectiveRequest = {
    ...request,
    targetMarginPercent: request.targetMarginPercent ?? Number(project.targetMargin.toString()),
  };
  const lunaPlan = createLunaSearchPlan(effectiveRequest);
  const providerInput = supplierOfferSearchInputSchema.parse(
    buildLunaProviderSearchInput(lunaPlan, effectiveRequest),
  );
  const outcome = await searchSupplierOffersWithPersistentFallback(providerInput, activeProvider);
  const fetchedAt = new Date().toISOString();
  const constrainedResults = applyLunaSearchConstraints(outcome.results, effectiveRequest);
  const enrichment = await findCandidateEnrichment(projectId, organizationId);
  const tajaAnalysis = analyzeAndRankTajaCandidates(
    constrainedResults.map((result) => ({
      result,
      enrichment: enrichment.get(canonicalSupplierProductUrl(result.productUrl)),
    })),
    {
      quantity: effectiveRequest.quantity,
      targetMarginPercent: effectiveRequest.targetMarginPercent,
    },
  );
  const results = tajaAnalysis.rankedResults.map((result) => ({
    ...result,
    provenance: {
      fetchedAt,
      resultOrigin: outcome.resultOrigin ?? "live",
      originalQuery: effectiveRequest.query,
      providerQuery: lunaPlan.providerQuery,
      chinese1688Query: lunaPlan.chinese1688Query,
      targetCountry: effectiveRequest.targetCountry,
      quantity: effectiveRequest.quantity,
    },
  }));

  return {
    ...outcome,
    results,
    candidateAnalyses: tajaAnalysis.analyses,
    unfilteredResultCount: outcome.results.length,
    lunaPlan,
    fetchedAt,
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
