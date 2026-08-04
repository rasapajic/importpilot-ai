import { ProjectActivityType } from "@prisma/client";
import { notFound } from "next/navigation";

import { NegotiationAssistant } from "@/components/negotiation/negotiation-assistant";
import { OffersPanel } from "@/components/offers/offers-panel";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { DirectUploadForm } from "@/components/projects/direct-upload-form";
import { MobileWorkflowActionBar } from "@/components/projects/mobile-workflow-action-bar";
import { ProfitabilityRecoveryPanel } from "@/components/projects/profitability-recovery-panel";
import { ProjectBackLink } from "@/components/projects/project-back-link";
import { ProjectWorkflowStep } from "@/components/projects/project-workflow-step";
import { SimpleProfitabilityPanel } from "@/components/projects/simple-profitability-panel";
import { SupplierOfferSearch } from "@/components/search/supplier-offer-search";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { requireSession } from "@/modules/auth/infrastructure/session";
import {
  getDecisionStepSummary,
  getDecisionStepTitle,
  isFinalDecisionStatus,
} from "@/modules/decisions/application/decision-step-summary";
import { getLatestProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import { getServerLocale } from "@/modules/i18n/server";
import { getStatusLabel, translateText } from "@/modules/i18n/translations";
import { listNegotiationMessages } from "@/modules/negotiation/application/negotiation-service";
import { getProject } from "@/modules/projects/application/project-service";
import { canDeleteEmptySearch } from "@/modules/projects/domain/empty-search-deletion";
import { getMobileWorkflowActions } from "@/modules/projects/domain/mobile-workflow-actions";
import {
  getProjectWorkflow,
  type ProjectWorkflowStepId,
  type ProjectWorkflowStepStatus,
} from "@/modules/projects/domain/project-workflow";
import {
  getDecisionStepBadge,
  getOfferStepDisplay,
  getProductStepDisplay,
} from "@/modules/projects/domain/workflow-step-display";
import { listProjectActivities } from "@/modules/timeline/application/timeline-service";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    activityType?: string;
    editCalculationOffer?: string;
    importUrl?: string;
    profitabilityError?: string;
  }>;
}) {
  const auth = await requireSession();
  const locale = await getServerLocale();
  const t = (text: string) => translateText(text, locale);
  const { projectId } = await params;
  const project = await getProject(projectId, auth.membership.organizationId);
  if (!project) notFound();

  const projectDisplayName = t(project.name);
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

  const offerCount = project.offers.length;
  const calculatedOffers = project.offers.filter((offer) => offer.costCalculations.length > 0);
  const calculatedOfferCount = calculatedOffers.length;
  const assessedCalculatedOfferCount = calculatedOffers.filter(
    (offer) => offer.assessments.length > 0,
  ).length;
  const assessedOfferCount = project.offers.filter((offer) => offer.assessments.length > 0).length;
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
  const productStepDisplay = getProductStepDisplay(stepStatus.PRODUCT, locale);
  const offerStepDisplay = getOfferStepDisplay(stepStatus.OFFER, locale);
  const decisionStepTitle = getDecisionStepTitle(decision?.status, locale);
  const decisionStepSummary = getDecisionStepSummary(decision?.status, locale);
  const decisionStepBadge = getDecisionStepBadge(decisionAreaStatus, locale);

  return (
    <main className="dashboard-shell">
      <nav aria-label={t("Back to projects")}>
        <ProjectBackLink label={t("Back to projects")} />
      </nav>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">{getStatusLabel(project.status, locale)}</p>
          <h1>{projectDisplayName}</h1>
        </div>
      </header>

      <div className="project-workflow">
        <ProjectWorkflowStep
          number={1}
          title={productStepDisplay.title}
          status={stepStatus.PRODUCT}
          summary={(
            <span className="workflow-product-summary">
              <span>📍 {targetCountryName}</span>
              <span>📦 {project.quantity} {t("kom")}</span>
              <span>🎯 {t("Marža")} {project.targetMargin.toString()}%</span>
            </span>
          )}
          statusLabel={productStepDisplay.badge}
          lockedText={lockedText}
        >
          <section className="dashboard-card project-summary">
            <p>{t("Naziv proizvoda")}: <strong>{projectDisplayName}</strong></p>
            <p>{t("Ciljna zemlja")}: <strong>{targetCountryName}</strong></p>
            <p>{t("Količina")}: <strong>{project.quantity}</strong></p>
            <p>{t("Ciljna marža")}: <strong>{project.targetMargin.toString()}%</strong></p>
          </section>
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={resolvedSearchParams.importUrl === "1"}
          id="workflow-step-offer"
          number={2}
          title={offerStepDisplay.title}
          status={stepStatus.OFFER}
          summary={offerCount === 0 ? t("Još nema ponuda.") : `${offerCount} ${t("ponuda")}`}
          statusLabel={offerStepDisplay.badge}
          lockedText={lockedText}
        >
          <SupplierOfferSearch
            projectId={project.id}
            productName={projectDisplayName}
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
            projectName={projectDisplayName}
            targetCountry={project.targetCountry}
            projectQuantity={project.quantity}
            offers={project.offers}
            showCosts={false}
            showAssessments={false}
          />
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={Boolean(selectedCalculationOfferId)}
          id="workflow-step-decision"
          number={3}
          title={decisionStepTitle}
          status={decisionAreaStatus}
          summary={decisionStepSummary}
          statusLabel={decisionStepBadge}
          lockedText={lockedText}
          helperText={t("Pogledajte realnu nabavnu cenu, rizik dobavljača i očekivanu zaradu.")}
        >
          <SimpleProfitabilityPanel
            projectId={project.id}
            projectName={projectDisplayName}
            targetCountry={project.targetCountry}
            projectQuantity={project.quantity}
            offers={project.offers}
            decision={decision}
            selectedCalculationOfferId={selectedCalculationOfferId}
            profitabilityError={resolvedSearchParams.profitabilityError}
          />
          <ProfitabilityRecoveryPanel
            projectId={project.id}
            targetCountry={project.targetCountry}
            projectTargetMargin={Number(project.targetMargin.toString())}
            offers={project.offers}
            decision={decision}
          />
          {decision?.status === "NEGOTIATE_FIRST" && (
            <div id="negotiation-assistant">
              <NegotiationAssistant projectId={project.id} canGenerate messages={messages} />
            </div>
          )}
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
      </section>
      <MobileWorkflowActionBar actions={mobileWorkflowActions} locale={locale} />
    </main>
  );
}
