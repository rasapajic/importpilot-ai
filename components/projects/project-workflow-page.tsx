import { ProjectActivityType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDecisionPanel } from "@/components/decisions/project-decision-panel";
import { ProjectFeedbackPanel } from "@/components/feedback/project-feedback-panel";
import { ComparisonView } from "@/components/intelligence/comparison-view";
import { NegotiationAssistant } from "@/components/negotiation/negotiation-assistant";
import { OffersPanel } from "@/components/offers/offers-panel";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { DirectUploadForm } from "@/components/projects/direct-upload-form";
import { MobileWorkflowActionBar } from "@/components/projects/mobile-workflow-action-bar";
import { ProjectBackLink } from "@/components/projects/project-back-link";
import { ProjectStepNavigation } from "@/components/projects/project-step-navigation";
import { SupplierOfferSearch } from "@/components/search/supplier-offer-search";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { requireSession } from "@/modules/auth/infrastructure/session";
import { isFinalDecisionStatus } from "@/modules/decisions/application/decision-step-summary";
import { getLatestProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { getSimplifiedNextActions } from "@/modules/decisions/application/simplified-next-actions";
import { getProjectEvidence } from "@/modules/feedback/application/feedback-service";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import { getServerLocale } from "@/modules/i18n/server";
import { getStatusLabel, translateText } from "@/modules/i18n/translations";
import { compareProjectOffers } from "@/modules/intelligence/application/assessment-service";
import { hasReliableDetailedAssessment } from "@/modules/intelligence/domain/assessment-reliability";
import { listNegotiationMessages } from "@/modules/negotiation/application/negotiation-service";
import { getOfferMinimumQuality } from "@/modules/offers/domain/offer-minimum-quality";
import { getOfferReadiness } from "@/modules/offers/domain/offer-readiness";
import { getProject } from "@/modules/projects/application/project-service";
import { canDeleteEmptySearch } from "@/modules/projects/domain/empty-search-deletion";
import { getMobileWorkflowActions } from "@/modules/projects/domain/mobile-workflow-actions";
import {
  getProjectStepHref,
  type ProjectStepId,
} from "@/modules/projects/domain/project-step-routes";
import {
  publicOfferTitle,
  publicProjectName,
} from "@/modules/projects/domain/public-demo-text";
import { serializePrismaDecimals } from "@/modules/shared/serialize-prisma-decimals";
import { listProjectActivities } from "@/modules/timeline/application/timeline-service";

type WorkflowSearchParams = {
  activityType?: string;
  edit?: string;
  importUrl?: string;
  offer?: string;
  rfq?: string;
};

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function ProjectWorkflowPage({
  projectId,
  currentStep,
  searchParams,
}: {
  projectId: string;
  currentStep: ProjectStepId;
  searchParams: WorkflowSearchParams;
}) {
  const auth = await requireSession();
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const project = await getProject(projectId, auth.membership.organizationId);
  if (!project) notFound();

  const visibleOffers = project.offers.filter((offer) => {
    const metadata = metadataRecord(offer.sourceMetadata);
    return getOfferMinimumQuality({
      productTitle: typeof metadata.title === "string" ? metadata.title : project.name,
      requestedProduct: project.name,
      supplierName: offer.supplierName,
      unitPrice: offer.unitPrice,
      currency: offer.currency,
      productUrl: typeof metadata.productUrl === "string" ? metadata.productUrl : null,
      contactEmail: offer.contactEmail,
      contactPhone: offer.contactPhone,
    }).ready;
  });
  const readyOffers = visibleOffers.filter((offer) => getOfferReadiness({
    supplierName: offer.supplierName,
    unitPrice: offer.unitPrice,
    currency: offer.currency,
    moq: offer.moq,
    sourceMetadata: offer.sourceMetadata,
  }).ready);
  const analyzedOffers = readyOffers.filter((offer) => offer.assessments.length > 0);
  const calculatedOffers = analyzedOffers.filter((offer) => {
    const cost = offer.costCalculations[0];
    return cost?.calculationStatus === "CALCULATED" &&
      cost.landedCostTotal !== null &&
      cost.landedCostPerUnit !== null &&
      cost.grossMarginPercent !== null;
  });
  const decisionReadyOffers = calculatedOffers.filter((offer) => {
    const assessment = offer.assessments[0];
    return Boolean(assessment && hasReliableDetailedAssessment({
      confidenceScore: assessment.confidenceScore.toNumber(),
      scoreBreakdown: assessment.scoreBreakdown,
    }));
  });

  const storedDecision = await getLatestProjectDecision(projectId, auth.membership.organizationId);
  const decision = storedDecision && decisionReadyOffers.some((offer) => offer.id === storedDecision.selectedOfferId)
    ? storedDecision
    : null;
  const hasFinalRecommendation = isFinalDecisionStatus(decision?.status);
  const selectedOffer = visibleOffers.find((offer) => offer.id === searchParams.offer) ??
    readyOffers[0] ?? visibleOffers[0] ?? null;
  const selectedCalculationOfferId = searchParams.edit === "1" && selectedOffer?.costCalculations.length
    ? selectedOffer.id
    : undefined;
  const clientOffers = serializePrismaDecimals(visibleOffers);
  const focusedClientOffers = selectedOffer
    ? clientOffers.filter((offer) => offer.id === selectedOffer.id)
    : [];
  const analyzedClientOffers = clientOffers.filter((offer) => analyzedOffers.some((analyzed) => analyzed.id === offer.id));
  const pendingAssessmentOfferIds = readyOffers
    .filter((offer) => offer.assessments.length === 0)
    .map((offer) => offer.id);

  const selectedDecisionOffer = decision?.selectedOfferId
    ? visibleOffers.find((offer) => offer.id === decision.selectedOfferId)
    : null;
  const selectedDecisionCost = selectedDecisionOffer?.costCalculations[0];
  const selectedDecisionCalculation = selectedDecisionCost?.targetSellingPrice && selectedDecisionCost.landedCostPerUnit
    ? {
        targetSellingPrice: selectedDecisionCost.targetSellingPrice.toString(),
        landedCostPerUnit: selectedDecisionCost.landedCostPerUnit.toString(),
        currency: selectedDecisionCost.currency,
        quantity: selectedDecisionCost.quantity,
      }
    : null;
  const analyzedOfferSummaries = analyzedOffers.map((offer) => {
    const metadata = metadataRecord(offer.sourceMetadata);
    const cost = offer.costCalculations[0];
    const assessment = offer.assessments[0];
    return {
      offerId: offer.id,
      productName: publicOfferTitle(typeof metadata.title === "string" ? metadata.title : project.name),
      rfqProductName: typeof metadata.rfqProductNameEn === "string" ? metadata.rfqProductNameEn : null,
      supplierName: offer.supplierName,
      quantity: project.quantity,
      unitPrice: offer.unitPrice?.toString() ?? null,
      currency: offer.currency,
      calculationReady: cost?.calculationStatus === "CALCULATED" &&
        cost.landedCostTotal !== null &&
        cost.landedCostPerUnit !== null &&
        cost.grossMarginPercent !== null &&
        hasReliableDetailedAssessment({
          confidenceScore: assessment.confidenceScore.toNumber(),
          scoreBreakdown: assessment.scoreBreakdown,
        }),
      incoterm: offer.incoterm,
      productUrl: typeof metadata.productUrl === "string" ? metadata.productUrl : null,
      targetCountry: project.targetCountry,
    };
  });

  const completedSteps: ProjectStepId[] = ["PRODUCT"];
  if (visibleOffers.length > 0) completedSteps.push("OFFERS");
  if (analyzedOffers.length > 0) completedSteps.push("ANALYSIS");
  if (decisionReadyOffers.length > 0) completedSteps.push("COSTS");
  if (hasFinalRecommendation) completedSteps.push("DECISION");

  const existingSearchOffers = visibleOffers.map((offer) => {
    const metadata = metadataRecord(offer.sourceMetadata);
    return {
      productUrl: typeof metadata.productUrl === "string" ? metadata.productUrl : null,
      supplierName: offer.supplierName,
    };
  });
  const firstMetadata = visibleOffers.map((offer) => metadataRecord(offer.sourceMetadata))[0];
  const searchProductName = typeof firstMetadata?.searchProductName === "string"
    ? firstMetadata.searchProductName
    : project.name;
  const targetCountryName = getCountryDisplayName(project.targetCountry, locale);
  const projectName = publicProjectName(project.name);
  const canDeleteCurrentSearch = canDeleteEmptySearch({
    offerCount: project.offers.length,
    calculationCount: project.offers.filter((offer) => offer.costCalculations.length > 0).length,
    documentCount: project.files.length,
    hasCompletedRecommendation: hasFinalRecommendation,
  });
  const mobileWorkflowActions = getMobileWorkflowActions({
    projectId: project.id,
    offerCount: readyOffers.length,
    calculatedOfferCount: decisionReadyOffers.length,
    assessedOfferCount: analyzedOffers.length,
    hasFinalRecommendation,
    decisionStatus: decision?.status ?? null,
    currentStep,
  });

  const numberLocale = locale === "sr" ? "sr-Latn" : locale;
  const analysisHeading = analyzedOffers.length > 1
    ? `${t("Uporedna analiza")} ${analyzedOffers.length} ${t("ponuda")}`
    : selectedOffer
      ? `${t("Analiza ponude")}: ${selectedOffer.supplierName} — ${new Intl.NumberFormat(numberLocale).format(project.quantity)} ${t("kom")}`
      : t("Analiza ponude");

  let activityType: ProjectActivityType | undefined;
  let comparison = null;
  let messages: Awaited<ReturnType<typeof listNegotiationMessages>> = [];
  let activities: NonNullable<Awaited<ReturnType<typeof listProjectActivities>>> = [];
  let evidence: Awaited<ReturnType<typeof getProjectEvidence>> = null;
  if (currentStep === "DECISION") {
    activityType = Object.values(ProjectActivityType).includes(searchParams.activityType as ProjectActivityType)
      ? searchParams.activityType as ProjectActivityType
      : undefined;
    const [loadedComparison, loadedMessages, loadedActivities, loadedEvidence] = await Promise.all([
      compareProjectOffers(projectId, auth.membership.organizationId),
      listNegotiationMessages(projectId, auth.membership.organizationId),
      listProjectActivities(projectId, auth.membership.organizationId, activityType),
      getProjectEvidence(projectId, auth.membership.organizationId),
    ]);
    comparison = loadedComparison;
    messages = loadedMessages;
    activities = loadedActivities ?? [];
    evidence = loadedEvidence;
  }
  const visibleOfferIds = new Set(visibleOffers.map((offer) => offer.id));
  const publicActivities = activities.filter((activity) => {
    const metadata = metadataRecord(activity.metadata);
    return typeof metadata.offerId !== "string" || visibleOfferIds.has(metadata.offerId);
  });

  return (
    <main className="dashboard-shell project-step-page">
      <nav aria-label={t("Back to projects")}>
        <ProjectBackLink label={t("Back to projects")} />
      </nav>
      <header className="dashboard-header project-step-header">
        <div>
          <p className="eyebrow">{getStatusLabel(project.status, locale)}</p>
          <h1>{projectName}</h1>
        </div>
      </header>
      <ProjectStepNavigation
        completedSteps={completedSteps}
        currentStep={currentStep}
        locale={locale}
        projectId={project.id}
      />

      {currentStep === "PRODUCT" && (
        <section className="dashboard-card project-step-content-card">
          <p className="eyebrow">1 / 5</p>
          <h2>{t("Šta želite da kupite?")}</h2>
          <dl className="project-detail-list">
            <div><dt>{t("Naziv proizvoda")}</dt><dd>{projectName}</dd></div>
            <div><dt>{t("Ciljna zemlja")}</dt><dd>{targetCountryName}</dd></div>
            <div><dt>{t("Količina")}</dt><dd>{new Intl.NumberFormat(numberLocale).format(project.quantity)} {t("kom")}</dd></div>
            <div><dt>{t("Ciljna marža")}</dt><dd>{project.targetMargin.toString()}%</dd></div>
          </dl>
          <div className="project-step-footer">
            <Link className="primary-button" href={getProjectStepHref(project.id, "OFFERS")}>{t("Nastavi na izbor ponude")}</Link>
          </div>
        </section>
      )}

      {currentStep === "OFFERS" && (
        <>
          <header className="project-step-title">
            <p className="eyebrow">2 / 5</p>
            <h2>{t("Izbor ponude")}</h2>
            <p>{t("Pronađite ili dodajte ponudu, pa izaberite onu koju želite da analizirate.")}</p>
          </header>
          <SupplierOfferSearch
            canDeleteSearch={canDeleteCurrentSearch}
            existingOffers={existingSearchOffers}
            openUrlImport={searchParams.importUrl === "1"}
            productName={searchProductName}
            projectId={project.id}
            quantity={project.quantity}
            targetCountry={project.targetCountry}
          />
          {canDeleteCurrentSearch && <div className="empty-search-delete-panel"><DeleteEmptySearchButton projectId={project.id} /></div>}
          <OffersPanel
            offers={clientOffers}
            projectId={project.id}
            projectName={project.name}
            projectQuantity={project.quantity}
            showAssessments={false}
            showCosts={false}
            showSelectionActions
            targetCountry={project.targetCountry}
            title="Sačuvane ponude"
          />
          {readyOffers.length > 0 && (
            <div className="project-step-footer">
              <Link className="primary-button" href={`${getProjectStepHref(project.id, "ANALYSIS")}?offer=${readyOffers[0].id}`}>{t("Nastavi na analizu")}</Link>
            </div>
          )}
        </>
      )}

      {currentStep === "ANALYSIS" && (
        <>
          <header className="project-step-title">
            <p className="eyebrow">3 / 5</p>
            <h2>{analysisHeading}</h2>
            <p>{t("Analiza koristi samo potvrđene B2B ponude sa kompletnim podacima.")}</p>
          </header>
          <OffersPanel
            assessmentProgress={{ assessed: analyzedOffers.length, total: readyOffers.length }}
            bulkAssessmentOfferIds={pendingAssessmentOfferIds}
            offers={focusedClientOffers}
            openRfqOfferId={searchParams.rfq === "1" ? selectedOffer?.id : undefined}
            projectId={project.id}
            projectName={project.name}
            projectQuantity={project.quantity}
            showAddControls={false}
            showAnalysisActions
            showAssessments
            showCosts={false}
            targetCountry={project.targetCountry}
            title="Izabrana ponuda"
          />
          {analyzedOffers.length > 0 && (
            <div className="project-step-footer">
              <Link className="primary-button" href={`${getProjectStepHref(project.id, "COSTS")}?offer=${analyzedOffers[0].id}`}>{t("Nastavi na troškove uvoza")}</Link>
            </div>
          )}
        </>
      )}

      {currentStep === "COSTS" && (
        <>
          <header className="project-step-title">
            <p className="eyebrow">4 / 5</p>
            <h2>{t("Troškovi uvoza")}</h2>
            <p>{t("Potvrdite transport, carinu i ostale obavezne troškove samo za izabranu ponudu.")}</p>
          </header>
          <OffersPanel
            offers={focusedClientOffers.length > 0 && analyzedOffers.some((offer) => offer.id === selectedOffer?.id)
              ? focusedClientOffers
              : analyzedClientOffers.slice(0, 1)}
            projectId={project.id}
            projectName={project.name}
            projectQuantity={project.quantity}
            selectedCalculationOfferId={selectedCalculationOfferId}
            showAddControls={false}
            showAssessments={false}
            showCosts
            targetCountry={project.targetCountry}
            title="Troškovi izabrane ponude"
          />
          {decisionReadyOffers.length > 0 && (
            <div className="project-step-footer">
              <Link className="primary-button" href={`${getProjectStepHref(project.id, "DECISION")}?offer=${decisionReadyOffers[0].id}`}>{t("Nastavi na poređenje i odluku")}</Link>
            </div>
          )}
        </>
      )}

      {currentStep === "DECISION" && comparison && (
        <>
          <header className="project-step-title">
            <p className="eyebrow">5 / 5</p>
            <h2>{t("Poređenje i odluka")}</h2>
            <p>{t("Poređenje uključuje samo kompletne, analizirane i međusobno uporedive ponude.")}</p>
          </header>
          <ProjectDecisionPanel
            analyzedOffers={analyzedOfferSummaries}
            assessedOfferCount={analyzedOffers.length}
            decision={decision}
            projectId={project.id}
            selectedAnalysisOfferId={selectedOffer?.id}
            selectedCalculation={selectedDecisionCalculation}
          />
          <ComparisonView comparison={comparison} />
          {decision && (
            <section className="dashboard-card next-action-panel">
              <h2>{t("Sledeći korak")}</h2>
              <div className="actions">
                {getSimplifiedNextActions(decision.status).map((label) => {
                  const href = label === "Izvezi PDF"
                    ? `/projects/${project.id}/summary`
                    : label === "Pronađi nove ponude" || label === "Ubaci drugi link"
                      ? getProjectStepHref(project.id, "OFFERS")
                      : label === "Sačuvaj razlog"
                        ? "#feedback"
                        : label === "Predloži poruku" || label === "Traži bolju cenu" || label === "Traži manji MOQ"
                          ? "#negotiation-assistant"
                          : "#documents";
                  return <a className="secondary-button" href={href} key={label}>{t(label)}</a>;
                })}
              </div>
              {decision.status === "NEGOTIATE_FIRST" && (
                <div id="negotiation-assistant">
                  <NegotiationAssistant canGenerate messages={messages} projectId={project.id} />
                </div>
              )}
            </section>
          )}
          <section className="secondary-project-sections">
            <h2>{t("Dodatne informacije")}</h2>
            <details className="dashboard-card secondary-project-section" id="documents">
              <summary><strong>{t("Uvozni dokumenti")}</strong><span>{project.files.length}</span></summary>
              <p>{t("Ponude, proforme, transportne ponude i slike proizvoda na jednom mestu.")}</p>
              <DirectUploadForm
                documents={project.files.map((file) => ({
                  id: file.id,
                  originalFilename: file.originalFilename,
                  size: file.size.toString(),
                  documentType: file.documentType,
                  linkedOffer: file.linkedOffer,
                }))}
                offers={visibleOffers.map((offer) => ({ id: offer.id, supplierName: offer.supplierName }))}
                projectId={project.id}
              />
            </details>
            <ProjectTimeline activities={publicActivities} selectedType={activityType} />
            {evidence && (
              <details className="dashboard-card secondary-project-section" id="feedback">
                <summary><strong>{t("Analitika i povratne informacije")}</strong></summary>
                <ProjectFeedbackPanel
                  completionHistory={evidence.completionHistory.map((item) => ({ id: item.id, label: item.status, createdAt: item.createdAt.toISOString() }))}
                  completionStatus={evidence.completionStatus}
                  feedbackHistory={evidence.recommendationFeedback.map((item) => ({
                    id: item.id,
                    label: item.vote,
                    detail: item.comment ?? undefined,
                    createdAt: item.createdAt.toISOString(),
                  }))}
                  hasDecision={Boolean(decision)}
                  outcomeHistory={evidence.outcomes.map((item) => ({
                    id: item.id,
                    label: item.outcome,
                    detail: [item.finalPrice && item.finalCurrency ? `${item.finalPrice.toString()} ${item.finalCurrency}` : null, item.comment].filter(Boolean).join(" · ") || undefined,
                    createdAt: item.createdAt.toISOString(),
                  }))}
                  projectId={project.id}
                />
              </details>
            )}
          </section>
        </>
      )}
      <MobileWorkflowActionBar actions={mobileWorkflowActions} locale={locale} />
    </main>
  );
}
