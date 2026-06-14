"use client";

import type { CostCalculation, OfferAssessment, SupplierOffer } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { ManualOfferForm } from "@/components/offers/manual-offer-form";
import { CostCalculatorForm } from "@/components/costs/cost-calculator-form";
import { AssessmentPanel } from "@/components/intelligence/assessment-panel";
import { useI18n } from "@/components/i18n/i18n-provider";
import { ResponsiveOfferDetails } from "@/components/offers/responsive-offer-details";
import { getStatusLabel } from "@/modules/i18n/translations";
import { recommendationBadgeStatus } from "@/modules/intelligence/application/recommendation-display";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import { getMoqStatus } from "@/modules/offers/domain/moq-status";
import {
  assessSupplierRiskV2,
  type SupplierRiskLevel,
} from "@/modules/intelligence/domain/supplier-risk-v2";

type OfferWithDetails = SupplierOffer & {
  costCalculations: CostCalculation[];
  assessments: OfferAssessment[];
};

export function OffersPanel({
  projectId,
  projectName,
  targetCountry,
  projectQuantity,
  offers,
  showAddControls = true,
  showCosts = true,
  showAssessments = true,
  showRecalculationLinks = false,
  selectedCalculationOfferId,
  assessmentProgress,
  bulkAssessmentOfferIds = [],
}: {
  projectId: string;
  projectName: string;
  targetCountry: string;
  projectQuantity: number;
  showAddControls?: boolean;
  showCosts?: boolean;
  showAssessments?: boolean;
  showRecalculationLinks?: boolean;
  selectedCalculationOfferId?: string;
  assessmentProgress?: { assessed: number; total: number };
  bulkAssessmentOfferIds?: string[];
  offers: OfferWithDetails[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [bulkAssessing, setBulkAssessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function openManualOffer() {
      setShowAdd(true);
      requestAnimationFrame(() =>
        document.getElementById("manual-offer-form")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }

    window.addEventListener("importpilot:manual-offer", openManualOffer);
    return () => window.removeEventListener("importpilot:manual-offer", openManualOffer);
  }, []);

  async function remove(offerId: string) {
    if (!window.confirm(t("Obrisati ovu ponudu?"))) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/offers/${offerId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? t("Ponuda nije obrisana. Pokušajte ponovo."));
      } else {
        router.refresh();
      }
    } catch {
      setError(t("Veza sa serverom nije dostupna. Pokušajte ponovo."));
    } finally {
      setPending(false);
    }
  }

  async function assessAll() {
    if (bulkAssessmentOfferIds.length === 0) return;
    setBulkAssessing(true);
    setError("");
    try {
      for (const offerId of bulkAssessmentOfferIds) {
        const response = await fetch(`/api/offers/${offerId}/assessments`, { method: "POST" });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? t("Assessment could not be completed. Please try again."));
        }
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Assessment could not be completed. Please try again."),
      );
    } finally {
      setBulkAssessing(false);
    }
  }

  function numberFromDecimal(value: { toString(): string } | number | null | undefined) {
    if (value === null || value === undefined) return null;
    const number = Number(value.toString());
    return Number.isFinite(number) ? number : null;
  }

  function riskLabel(level: SupplierRiskLevel) {
    if (level === "LOW") return "Nizak rizik";
    if (level === "MEDIUM") return "Srednji rizik";
    if (level === "HIGH") return "Visok rizik";
    return "Rizik nepoznat";
  }

  return (
    <section className="dashboard-card">
      <header className="section-header">
        <h2>{t("Ponude dobavljača")}</h2>
        {assessmentProgress && (
          <div className="actions">
            <strong>{t("Assessment progress")} {assessmentProgress.assessed}/{assessmentProgress.total}</strong>
            <button
              className="secondary-button"
              disabled={bulkAssessing || bulkAssessmentOfferIds.length === 0}
              onClick={assessAll}
              type="button"
            >
              {bulkAssessing ? t("Assessing...") : t("Assess all offers")}
            </button>
          </div>
        )}
        {showAddControls && (
          <button className="secondary-button" onClick={() => setShowAdd((value) => !value)} type="button">
            {t("Ručno dodaj ponudu")}
          </button>
        )}
      </header>
      {showAddControls && showAdd && (
        <div id="manual-offer-form">
          <ManualOfferForm projectId={projectId} onDone={() => setShowAdd(false)} />
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="offer-list">
        {offers.map((offer) => {
          const moq = getMoqStatus({ projectQuantity, moq: offer.moq });
          const supplierRisk = assessSupplierRiskV2({
            verifiedSupplier: offer.supplierVerified,
            yearsOnPlatform: offer.yearsOnPlatform,
            responseRatePercent: numberFromDecimal(offer.responseRatePercent),
            transactionCount: offer.transactionCount,
            employeeCount: offer.employeeCount,
            profileCompletenessScore: offer.profileCompletenessScore,
            sampleAvailable: offer.sampleAvailable,
            clearCommercialTermsScore: offer.termsClarityScore,
            clearTransportScore: offer.shippingClarityScore,
          });

          return (
            <article className="offer-card" key={offer.id}>
              <header>
                <strong>{offer.supplierName}</strong>
                <span className="offer-source-label">{getStatusLabel(offer.extractionStatus, locale)}</span>
              </header>
              <div className="offer-badges" aria-label={t("Supplier signals")}>
                <span className={`moq-badge moq-badge-${moq.status.toLowerCase()}`}>{t(moq.label)}</span>
                <span className={`risk-badge risk-badge-${supplierRisk.riskLevel.toLowerCase()}`}>{t(riskLabel(supplierRisk.riskLevel))}</span>
              </div>
              <div className="offer-highlights">
                <span>
                  {t("Supplier price")}
                  <strong>
                    {offer.unitPrice ? (() => {
                      const display = getEuroDisplay(offer.unitPrice, offer.currency);
                      return display.converted ? `${display.original} (≈ ${display.eur})` : display.original;
                    })() : t("Price not specified")}
                  </strong>
                </span>
                <span>
                  {t("Očekivana marža")}
                  <strong>{offer.costCalculations[0] ? `${offer.costCalculations[0].grossMarginPercent.toString()}%` : t("Nije izračunata")}</strong>
                </span>
                <span>
                  {offer.assessments[0] ? t("Preporuka") : t("Status")}
                  <strong>
                    {offer.assessments[0]
                      ? getStatusLabel(recommendationBadgeStatus(offer.assessments[0].recommendationStatus), locale)
                      : t("Čeka analizu")}
                  </strong>
                </span>
              </div>
              <ResponsiveOfferDetails summary={t("Prikaži detalje")}>
                <p>
                  {offer.moq
                    ? `${t("Minimalna količina (MOQ)")}: ${offer.moq} ${t("kom")}`
                    : t("Minimalna količina (MOQ) nije navedena")} · {offer.incoterm ?? t("Incoterm nije naveden")}
                </p>
                {moq.status === "BLOCKING" && <p className="form-error">{t(moq.message)}</p>}
                {showAddControls && (
                  <div className="actions">
                    <button className="secondary-button" onClick={() => setEditing(editing === offer.id ? null : offer.id)} type="button">{t("Izmeni")}</button>
                    {offer.extractionStatus === "MANUAL" && (
                      <button className="danger-button" disabled={pending} onClick={() => remove(offer.id)} type="button">{t("Obriši")}</button>
                    )}
                  </div>
                )}
                {showAddControls && editing === offer.id && <ManualOfferForm projectId={projectId} offer={offer} onDone={() => setEditing(null)} />}
                {showRecalculationLinks && offer.costCalculations[0] && (
                  <Link
                    className="secondary-button"
                    href={`/projects/${projectId}?editCalculationOffer=${offer.id}#workflow-step-cost`}
                  >
                    {t("Izmeni vrednosti za kalkulaciju")}
                  </Link>
                )}
                {showCosts && (
                  offer.unitPrice && offer.currency && offer.incoterm ? (
                    <CostCalculatorForm
                      offerId={offer.id}
                      currency={offer.currency}
                      targetCountry={targetCountry}
                      productName={projectName}
                      quantity={projectQuantity}
                      sourceMetadata={offer.sourceMetadata}
                      latestCalculation={offer.costCalculations[0]}
                      editInitially={selectedCalculationOfferId === offer.id}
                    />
                  ) : (
                    <div className="calculation-requirements">
                      <strong>{t("Potrebno za kalkulaciju")}:</strong>
                      <ul>
                        <li className={offer.unitPrice ? "requirement-complete" : "requirement-missing"}>
                          <span aria-hidden="true">{offer.unitPrice ? "✓" : "○"}</span> {t("cena")}
                        </li>
                        <li className={offer.currency ? "requirement-complete" : "requirement-missing"}>
                          <span aria-hidden="true">{offer.currency ? "✓" : "○"}</span> {t("valuta")}
                        </li>
                        <li className={offer.incoterm ? "requirement-complete" : "requirement-missing"}>
                          <span aria-hidden="true">{offer.incoterm ? "✓" : "○"}</span> {t("uslov isporuke (Incoterm)")}
                        </li>
                      </ul>
                    </div>
                  )
                )}
                {showAssessments && <AssessmentPanel offerId={offer.id} assessments={offer.assessments} />}
              </ResponsiveOfferDetails>
            </article>
          );
        })}
        {offers.length === 0 && (
          <div className="empty-state">
            <h3>{t("Još nema ponuda.")}</h3>
            <p>{t("Ručno dodajte ponudu ili otpremite dokument ponude u uvozne dokumente.")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
