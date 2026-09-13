import { notFound } from "next/navigation";

import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { ProjectBackLink } from "@/components/projects/project-back-link";
import { ProjectWorkflowStep } from "@/components/projects/project-workflow-step";
import { SimpleProfitabilityPanel } from "@/components/projects/simple-profitability-panel";
import { SimpleSupplierOfferSearch } from "@/components/search/simple-supplier-offer-search";
import { SupplierOfferSearch } from "@/components/search/supplier-offer-search";
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
import { loadCachedProjectSupplierOffers } from "@/modules/product-search/application/product-search-service";
import { getProject } from "@/modules/projects/application/project-service";
import { canDeleteEmptySearch } from "@/modules/projects/domain/empty-search-deletion";
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

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    autoSearch?: string;
    editCalculationOffer?: string;
    importUrl?: string;
    profitabilityError?: string;
    selectedOffer?: string;
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
  const resolvedSearchParams = await searchParams;
  const autoStartSupplierSearch = resolvedSearchParams.autoSearch === "1";
  const initialSupplierSearch = autoStartSupplierSearch
    ? null
    : await loadCachedProjectSupplierOffers(
        projectId,
        auth.membership.organizationId,
        {
          query: projectDisplayName,
          quantity: project.quantity,
          targetCountry: project.targetCountry,
          avoidComplexCompliance: true,
          privateLabel: false,
        },
      );
  const selectedCalculationOfferId = project.offers.some(
    (offer) => offer.id === resolvedSearchParams.editCalculationOffer && offer.costCalculations.length > 0,
  )
    ? resolvedSearchParams.editCalculationOffer
    : undefined;
  const focusedOfferId = project.offers.some(
    (offer) => offer.id === resolvedSearchParams.selectedOffer,
  )
    ? resolvedSearchParams.selectedOffer
    : undefined;
  const decisionMatchesFocusedOffer = !focusedOfferId || decision?.selectedOfferId === focusedOfferId;
  const visibleDecisionStatus = decisionMatchesFocusedOffer ? decision?.status ?? null : null;

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
    hasDecision: Boolean(visibleDecisionStatus),
    decisionStatus: visibleDecisionStatus,
  });
  const stepStatus = Object.fromEntries(
    workflow.map((step) => [step.id, step.status]),
  ) as Record<ProjectWorkflowStepId, ProjectWorkflowStepStatus>;
  const projectHasFinalRecommendation = isFinalDecisionStatus(decision?.status);
  const hasFinalRecommendation = isFinalDecisionStatus(visibleDecisionStatus);
  const canDeleteCurrentSearch = canDeleteEmptySearch({
    offerCount,
    calculationCount: calculatedOfferCount,
    documentCount: project.files.length,
    hasCompletedRecommendation: projectHasFinalRecommendation,
  });
  const decisionAreaStatus: ProjectWorkflowStepStatus = !offerCount
    ? "LOCKED"
    : hasFinalRecommendation
      ? "COMPLETED"
      : "ACTIVE";
  const targetCountryName = getCountryDisplayName(project.targetCountry, locale);
  const lockedText = t("Završite prethodni korak da biste nastavili.");
  const productStepDisplay = getProductStepDisplay(stepStatus.PRODUCT, locale);
  const offerStepDisplay = getOfferStepDisplay(stepStatus.OFFER, locale);
  const decisionStepTitle = getDecisionStepTitle(visibleDecisionStatus, locale);
  const decisionStepSummary = getDecisionStepSummary(visibleDecisionStatus, locale);
  const decisionStepBadge = getDecisionStepBadge(decisionAreaStatus, locale);
  const legacyUrlImport = resolvedSearchParams.importUrl === "1";

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
            </span>
          )}
          statusLabel={productStepDisplay.badge}
          lockedText={lockedText}
        >
          <section className="dashboard-card project-summary">
            <p>{t("Naziv proizvoda")}: <strong>{projectDisplayName}</strong></p>
            <p>{t("Ciljna zemlja")}: <strong>{targetCountryName}</strong></p>
            <p>{t("Količina")}: <strong>{project.quantity}</strong></p>
          </section>
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={legacyUrlImport || autoStartSupplierSearch}
          id="workflow-step-offer"
          number={2}
          title={offerStepDisplay.title}
          status={stepStatus.OFFER}
          summary={offerCount === 0 ? t("Još nema izabrane ponude.") : t("Ponuda je izabrana.")}
          statusLabel={offerStepDisplay.badge}
          lockedText={lockedText}
        >
          {legacyUrlImport ? (
            <SupplierOfferSearch
              projectId={project.id}
              productName={projectDisplayName}
              quantity={project.quantity}
              targetCountry={project.targetCountry}
              openUrlImport
              canDeleteSearch={canDeleteCurrentSearch}
              initialOutcome={initialSupplierSearch}
            />
          ) : (
            <SimpleSupplierOfferSearch
              projectId={project.id}
              productName={projectDisplayName}
              quantity={project.quantity}
              targetCountry={project.targetCountry}
              autoStart={autoStartSupplierSearch}
              initialOutcome={initialSupplierSearch}
            />
          )}
          {canDeleteCurrentSearch && (
            <div className="empty-search-delete-panel">
              <DeleteEmptySearchButton projectId={project.id} />
            </div>
          )}
        </ProjectWorkflowStep>

        <ProjectWorkflowStep
          forceOpen={Boolean(selectedCalculationOfferId || focusedOfferId)}
          id="workflow-step-decision"
          number={3}
          title={decisionStepTitle}
          status={decisionAreaStatus}
          summary={decisionStepSummary}
          statusLabel={decisionStepBadge}
          lockedText={lockedText}
          helperText={t("Unesite svoju prodajnu cenu, proverite stvarni trošak i dobijte jasnu odluku.")}
        >
          <SimpleProfitabilityPanel
            projectId={project.id}
            projectName={projectDisplayName}
            targetCountry={project.targetCountry}
            projectQuantity={project.quantity}
            offers={project.offers}
            decision={decision}
            focusedOfferId={focusedOfferId}
            selectedCalculationOfferId={selectedCalculationOfferId}
            profitabilityError={resolvedSearchParams.profitabilityError}
          />
        </ProjectWorkflowStep>
      </div>
    </main>
  );
}