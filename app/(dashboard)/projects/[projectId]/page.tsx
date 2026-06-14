import { notFound } from "next/navigation";
import { ProjectActivityType } from "@prisma/client";

import { ProjectDecisionPanel } from "@/components/decisions/project-decision-panel";
import { ProjectFeedbackPanel } from "@/components/feedback/project-feedback-panel";
import { ComparisonView } from "@/components/intelligence/comparison-view";
import { NegotiationAssistant } from "@/components/negotiation/negotiation-assistant";
import { OffersPanel } from "@/components/offers/offers-panel";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { DirectUploadForm } from "@/components/projects/direct-upload-form";
import { MobileWorkflowActionBar } from "@/components/projects/mobile-workflow-action-bar";
import { ProjectBackLink } from "@/components/projects/project-back-link";
import { ProjectWorkflowStep } from "@/components/projects/project-workflow-step";
import { SupplierOfferSearch } from "@/components/search/supplier-offer-search";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { requireSession } from "@/modules/auth/infrastructure/session";
import {
  getDecisionStepSummary,
  isFinalDecisionStatus,
} from "@/modules/decisions/application/decision-step-summary";
import { getLatestProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { getSimplifiedNextActions } from "@/modules/decisions/application/simplified-next-actions";
import { getProjectEvidence } from "@/modules/feedback/application/feedback-service";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import { getServerLocale } from "@/modules/i18n/server";
import { getStatusLabel, translateText } from "@/modules/i18n/translations";
import { compareProjectOffers } from "@/modules/intelligence/application/assessment-service";
import { listNegotiationMessages } from "@/modules/negotiation/application/negotiation-service";
import { getProject } from "@/modules/projects/application/project-service";
import { canDeleteEmptySearch } from "@/modules/projects/domain/empty-search-deletion";
import { getMobileWorkflowActions } from "@/modules/projects/domain/mobile-workflow-actions";
import {
  getProjectWorkflow,
  type ProjectWorkflowStepId,
  type ProjectWorkflowStepStatus,
} from "@/modules/projects/domain/project-workflow";
import { listProjectActivities } from "@/modules/timeline/application/timeline-service";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    activityType?: string;
    editCalculationOffer?: string;
    newAnalysis?: string;
    importUrl?: string;
  }>;
}) {
  const auth = await requireSession();
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const { projectId } = await params;
  const project = await getProject(projectId, auth.membership.organizationId);
  if (!project) notFound();

  const comparison = await compareProjectOffers(projectId, auth.membership.organizationId);
  const decision = await getLatestProjectDecision(projectId, auth.membership.organizationId);
  const messages = await listNegotiationMessages(projectId, auth.membership.organizationId);
  const resolvedSearchParams = await searchParams;
  const requestedType = resolvedSearchParams.activityType;
  const selectedCalculationOfferId = project.offers.some(
    (offer) => offer.id === resolvedSearchParams.editCalculationOffer && offer.costCalculations.length > 0,
  )
    ? resolvedSearchParams.editCalculationOffer
    : undefined;
  const activityType = Object.values(ProjectActivityType).includes(
    requestedType as ProjectActivityType,
  )
    ? (requestedType as ProjectActivityType)
    : undefined;
  const activities = await listProjectActivities(
    projectId,
    auth.membership.organizationId,
    activityType,
  );
  const evidence = await getProjectEvidence(projectId, auth.membership.organizationId);

  const offerCount = project.offers.length;
  const calculatedOffers = project.offers.filter((offer) => offer.costCalculations.length > 0);
  const calculatedOfferCount = calculatedOffers.length;
  const assessedCalculatedOfferCount = calculatedOffers.filter(
    (offer) => offer.assessments.length > 0,
  ).length;
  const assessedOfferCount = project.offers.filter((offer) => offer.assessments.length > 0).length;
  const pendingAssessmentOfferIds = project.offers
    .filter((offer) => offer.assessments.length === 0)
    .map((offer) => offer.id);
  const selectedDecisionOffer = decision?.selectedOfferId
    ? project.offers.find((offer) => offer.id === decision.selectedOfferId)
    : null;
  const selectedDecisionCalculation = selectedDecisionOffer?.costCalculations[0]
    ? {
        targetSellingPrice: selectedDecisionOffer.costCalculations[0].targetSellingPrice.toString(),
        landedCostPerUnit: selectedDecisionOffer.costCalculations[0].landedCostPerUnit.toString(),
        currency: selectedDecisionOffer.costCalculations[0].currency,
        quantity: selectedDecisionOffer.costCalculations[0].quantity,
      }
    : null;
  const workflow = getProjectWorkflow({
    offerCount,
    calculatedOfferCount,
    assessedOfferCount,
    assessedCalculatedOfferCount,
    hasDecision: Boolean(decision),
    decisionStatus: decision?.status ?? null,
  });
  const stepStatus = Object.fromEntries(
    workflow.map((step) => [step.id, step.status]),
  ) as Record<ProjectWorkflowStepId, ProjectWorkflowStepStatus>;
  const hasFinalRecommendation = isFinalDecisionStatus(decision?.status);
  const canDeleteCurrentSearch = canDeleteEmptySearch({
    offerCount,
    calculationCount: calculatedOfferCount,
    documentCount: project.files.length,
    hasCompletedRecommendation: hasFinalRecommendation,
  });
  const decisionAreaStatus: ProjectWorkflowStepStatus = !offerCount
    ? "LOCKED"
    : hasFinalRecommendation
      ? "COMPLETED"
      : "ACTIVE";
  const nextActionStatus: ProjectWorkflowStepStatus = hasFinalRecommendation ? "ACTIVE" : "LOCKED";
  const simplifiedNextActions = hasFinalRecommendation && decision ? getSimplifiedNextActions(decision.status) : [];
  const nextActionTitle =
    decision?.status === "READY_TO_BUY"
      ? "Krenite u kupovinu"
      : decision?.status === "NEGOTIATE_FIRST"
        ? "Pregovarajte sa dobavljačem"
        : decision?.status === "DO_NOT_BUY"
          ? "Preskočite ovu ponudu"
          : "Generiši odluku";
  const nextActionHref = (label: string) => {
    if (label === "Izvezi PDF") return `/projects/${project.id}/summary`;
    if (label === "Predloži poruku" || label === "Traži bolju cenu" || label === "Traži manji MOQ") {
      return "#negotiation-assistant";
    }
    if (label === "Pronađi nove ponude") return "#workflow-step-offer";
    if (label === "Ubaci drugi link") return `/projects/${project.id}?importUrl=1#workflow-step-offer`;
    if (label === "Sačuvaj razlog") return "#feedback";
    if (label === "Generiši odluku") return "#workflow-step-decision";
    return "#documents";
  };
  const advancedDetailsOpen = Boolean(selectedCalculationOfferId) || resolvedSearchParams.newAnalysis === "1";
  const mobileWorkflowActions = getMobileWorkflowActions({
    projectId: project.id,
    offerCount,
    calculatedOfferCount,
    assessedOfferCount,
    hasFinalRecommendation,
    decisionStatus: decision?.status ?? null,
  });
  const targetCountryName = getCountryDisplayName(project.targetCountry, locale);
  const lockedText = t("Završite prethodni korak da biste nastavili.");
  const statusLabel = (status: ProjectWorkflowStepStatus, activeLabel: string) =>
    status === "COMPLETED"
      ? t("Završeno")
      : status === "ACTIVE"
        ? t(activeLabel)
        : t("Zaključano");

  return (
    <main className="dashboard-shell">
      <nav aria-label={t("Back to projects")}>
        <ProjectBackLink label={t("Back to projects")} />
      </nav>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">{getStatusLabel(project.status, locale)}</p>
          <h1>{translateText(project.name, locale)}</h1>
        </div>
      </header>

      <div className="project-workflow">
        <ProjectWorkflowStep
          number={1}
          title={t("Šta želite da kupite?")}
          status={stepStatus.PRODUCT}
          summary={(
            <span className="workflow-product-summary">
              <span>📍 {targetCountryName}</span>
              <span>📦 {project.quantity} {t("kom")}</span>
              <span>🎯 {t("Marža")} {project.targetMargin.toString()}%</span>
            </span>
          )}
          statusLabel={statusLabel(stepStatus.PRODUCT, "Dovršite korak")}
          lockedText={lockedText}
        >
          <section className="dashboard-card project-summary">
            <p>{t("Naziv proizvoda")}: <strong>{translateText(project.name, locale)}</strong></p>
            <p>{t("Ciljna zemlja")}: <strong>{targetCountryName}</strong></p>
            <p>{t("Količina")}: <strong>{project.quantity}</strong></p>
            <p>{t("Ciljna marža")}: <strong>{project.targetMargin.toString()}%</strong></p>
          </section>
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={resolvedSearchParams.importUrl === "1"}
          id="workflow-step-offer"
          number={2}
          title={t("Ponude dobavljača")}
          status={stepStatus.OFFER}
          summary={offerCount === 0 ? t("Još nema ponuda.") : `${offerCount} ${t("ponuda")}`}
          statusLabel={statusLabel(stepStatus.OFFER, "Dodaj ponudu")}
          lockedText={lockedText}
        >
          <SupplierOfferSearch
            projectId={project.id}
            productName={project.name}
            quantity={project.quantity}
            targetCountry={project.targetCountry}
            openUrlImport={resolvedSearchParams.importUrl === "1"}
            canDeleteSearch={canDeleteCurrentSearch}
          />
          {canDeleteCurrentSearch && (
            <div className="empty-search-delete-panel">
              <DeleteEmptySearchButton projectId={project.id} />
            </div>
          )}
          <OffersPanel
            projectId={project.id}
            projectName={project.name}
            targetCountry={project.targetCountry}
            projectQuantity={project.quantity}
            offers={project.offers}
            showCosts={false}
            showAssessments={false}
          />
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={advancedDetailsOpen}
          id="workflow-step-decision"
          number={3}
          title={t("Da li se isplati?")}
          status={decisionAreaStatus}
          summary={getDecisionStepSummary(decision?.status, locale)}
          statusLabel={statusLabel(decisionAreaStatus, "Proveri isplativost")}
          lockedText={lockedText}
          helperText={t("Pogledajte realnu nabavnu cenu, rizik dobavljača i očekivanu zaradu.")}
        >
          <ProjectDecisionPanel
            projectId={project.id}
            decision={decision}
            selectedCalculation={selectedDecisionCalculation}
          />
          <details
            className="dashboard-card secondary-project-section advanced-decision-details"
            open={advancedDetailsOpen}
          >
            <summary><strong>{t("Prikaži detalje")}</strong></summary>
            <div className="advanced-detail-grid">
              <section>
                <h3>{t("Realna nabavna cena")}</h3>
                <p className="workflow-helper-text">{t("Dodajte transport, poreze i troškove da biste dobili realnu cenu.")}</p>
                <OffersPanel
                  projectId={project.id}
                  projectName={project.name}
                  targetCountry={project.targetCountry}
                  projectQuantity={project.quantity}
                  offers={project.offers}
                  showAddControls={false}
                  showAssessments={false}
                  selectedCalculationOfferId={selectedCalculationOfferId}
                />
              </section>
              <section>
                <h3>{t("Detaljna analiza")}</h3>
                <OffersPanel
                  projectId={project.id}
                  projectName={project.name}
                  targetCountry={project.targetCountry}
                  projectQuantity={project.quantity}
                  offers={project.offers}
                  showAddControls={false}
                  showCosts={false}
                  showRecalculationLinks
                  assessmentProgress={{
                    assessed: assessedOfferCount,
                    total: offerCount,
                  }}
                  bulkAssessmentOfferIds={pendingAssessmentOfferIds}
                />
              </section>
              <ComparisonView groups={comparison} />
            </div>
          </details>
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          id="workflow-step-next"
          number={4}
          title={t("Sledeći korak")}
          status={nextActionStatus}
          summary={hasFinalRecommendation ? getDecisionStepSummary(decision?.status, locale) : t("Nakon preporuke")}
          statusLabel={statusLabel(nextActionStatus, "Sledeći korak")}
          lockedText={lockedText}
        >
          <section className="dashboard-card next-action-panel">
            {decision && (
              <>
                <h2>{t(nextActionTitle)}</h2>
                <div className="actions">
                  {simplifiedNextActions.map((label) => (
                    <a className="secondary-button" href={nextActionHref(label)} key={label}>{t(label)}</a>
                  ))}
                </div>
              </>
            )}
            {decision?.status === "NEGOTIATE_FIRST" && (
              <div id="negotiation-assistant">
                <NegotiationAssistant projectId={project.id} canGenerate messages={messages} />
              </div>
            )}
            {decision && !["READY_TO_BUY", "NEGOTIATE_FIRST", "DO_NOT_BUY"].includes(decision.status) && (
              <div className="empty-state">
                <h3>{t("Generiši odluku")}</h3>
                <p>{t("Dodajte još ponuda ili proverite detalje isplativosti.")}</p>
              </div>
            )}
          </section>
        </ProjectWorkflowStep>
      </div>

      <section className="secondary-project-sections">
        <h2>{t("Dodatne informacije")}</h2>
        <details className="dashboard-card secondary-project-section" id="documents">
          <summary>
            <strong>{t("Uvozni dokumenti")}</strong>
            <span>{project.files.length}</span>
          </summary>
          <p>{t("Ponude, proforme, transportne ponude i slike proizvoda na jednom mestu.")}</p>
          <DirectUploadForm
            projectId={project.id}
            offers={project.offers.map((offer) => ({
              id: offer.id,
              supplierName: offer.supplierName,
            }))}
            documents={project.files.map((file) => ({
              id: file.id,
              originalFilename: file.originalFilename,
              size: file.size.toString(),
              documentType: file.documentType,
              linkedOffer: file.linkedOffer,
            }))}
          />
        </details>
        <ProjectTimeline activities={activities ?? []} selectedType={activityType} />
        {evidence && (
          <details className="dashboard-card secondary-project-section" id="feedback">
            <summary><strong>{t("Analitika i povratne informacije")}</strong></summary>
            <ProjectFeedbackPanel
              projectId={projectId}
              completionStatus={evidence.completionStatus}
              hasDecision={Boolean(decision)}
              outcomeHistory={evidence.outcomes.map((item) => ({
                id: item.id,
                label: item.outcome,
                detail: [
                  item.finalPrice && item.finalCurrency
                    ? `${item.finalPrice.toString()} ${item.finalCurrency}`
                    : null,
                  item.comment,
                ].filter(Boolean).join(" · ") || undefined,
                createdAt: item.createdAt.toISOString(),
              }))}
              feedbackHistory={evidence.recommendationFeedback.map((item) => ({
                id: item.id,
                label: item.vote,
                detail: item.comment ?? undefined,
                createdAt: item.createdAt.toISOString(),
              }))}
              completionHistory={evidence.completionHistory.map((item) => ({
                id: item.id,
                label: item.status,
                createdAt: item.createdAt.toISOString(),
              }))}
            />
          </details>
        )}
      </section>
      <MobileWorkflowActionBar actions={mobileWorkflowActions} locale={locale} />
    </main>
  );
}
