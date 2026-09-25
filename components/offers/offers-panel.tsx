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
import { RfqRequestPanel } from "@/components/search/rfq-request-panel";
import { getStatusLabel } from "@/modules/i18n/translations";
import { recommendationBadgeStatus } from "@/modules/intelligence/application/recommendation-display";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import { getMoqStatus } from "@/modules/offers/domain/moq-status";
import {
  assessSupplierRiskV2,
  type SupplierRiskLevel,
} from "@/modules/intelligence/domain/supplier-risk-v2";
import { classifyOffer } from "@/modules/product-search/domain/offer-classification";
import { getOfferReadiness, readinessExplanation } from "@/modules/offers/domain/offer-readiness";
import { formatDisplayedPercent } from "@/modules/cost-engine/application/calculation-summary";

type OfferWithDetails = SupplierOffer & {
  costCalculations: CostCalculation[];
  assessments: OfferAssessment[];
};

function isSupplierProductUrl(value: string | null): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.replace(/\/+$/, "").length > 0;
  } catch {
    return false;
  }
}

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
  showAnalysisActions = false,
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
  showAnalysisActions?: boolean;
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
  const [assessingOfferId, setAssessingOfferId] = useState<string | null>(null);
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

  async function analyzeOffer(offerId: string) {
    setAssessingOfferId(offerId);
    setError("");
    try {
      const response = await fetch(`/api/offers/${offerId}/assessments`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("Ocena ponude nije završena. Pokušajte ponovo."));
      router.push(`/projects/${projectId}?analysisOffer=${offerId}#workflow-step-decision`);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("Ocena ponude nije završena. Pokušajte ponovo."));
    } finally {
      setAssessingOfferId(null);
    }
  }

  function metadata(offer: OfferWithDetails) {
    return offer.sourceMetadata && typeof offer.sourceMetadata === "object" && !Array.isArray(offer.sourceMetadata)
      ? offer.sourceMetadata as Record<string, unknown>
      : {};
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
              title={bulkAssessmentOfferIds.length === 0 ? t("Nema kompletnih ponuda koje čekaju analizu.") : undefined}
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
          const data = metadata(offer);
          const classification = classifyOffer({
            source: typeof data.providerSource === "string" ? data.providerSource : undefined,
            targetCountry,
            supplierCountry: offer.supplierCountry,
            sellerCountry: typeof data.sellerCountry === "string" ? data.sellerCountry : undefined,
            originCountry: typeof data.originCountry === "string" ? data.originCountry : undefined,
            importerName: typeof data.importerName === "string" ? data.importerName : undefined,
            currency: offer.currency,
            offerType: data.offerType === "DOMESTIC" || data.offerType === "DIRECT_IMPORT" || data.offerType === "UNKNOWN" ? data.offerType : undefined,
            availabilityConfirmed: typeof data.availabilityConfirmed === "boolean" ? data.availabilityConfirmed : undefined,
            b2bPriceConfirmed: typeof data.b2bPriceConfirmed === "boolean" ? data.b2bPriceConfirmed : undefined,
            priceIncludesVat: typeof data.priceIncludesVat === "boolean" ? data.priceIncludesVat : undefined,
          });
          const productUrl = typeof data.productUrl === "string" ? data.productUrl : null;
          const title = typeof data.title === "string" ? data.title : projectName;
          const readiness = getOfferReadiness({
            supplierName: offer.supplierName,
            unitPrice: offer.unitPrice,
            currency: offer.currency,
            moq: offer.moq,
            sourceMetadata: offer.sourceMetadata,
          });

          const latestCalculation = offer.costCalculations[0];
          const calculationReady = latestCalculation?.calculationStatus === "CALCULATED" &&
            latestCalculation.landedCostTotal !== null &&
            latestCalculation.landedCostPerUnit !== null &&
            latestCalculation.grossMarginPercent !== null;
          const marginDisplay = latestCalculation?.grossMarginPercent && latestCalculation.targetSellingPrice
            ? `${formatDisplayedPercent(latestCalculation.grossMarginPercent)}% · ${t("Prodajna cena")}: ${latestCalculation.targetSellingPrice.toString()} ${latestCalculation.currency} · ${t("Unos korisnika")}`
            : t("Nije izračunata");

          return (
            <article className="offer-card" key={offer.id}>
              <header>
                <strong>{offer.supplierName}</strong>
                <span className="offer-source-label">{getStatusLabel(offer.extractionStatus, locale)}</span>
              </header>
              <div className="offer-badges" aria-label={t("Supplier signals")}>
                <span className={`offer-kind-badge offer-kind-${classification.kind.toLowerCase()}`}>{t(classification.label)}</span>
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
                  <strong>{marginDisplay}</strong>
                </span>
                <span>
                  {offer.assessments[0] && calculationReady ? t("Preporuka") : t("Status")}
                  <strong>
                    {offer.assessments[0] && calculationReady
                      ? getStatusLabel(recommendationBadgeStatus(offer.assessments[0].recommendationStatus), locale)
                      : offer.assessments[0]
                        ? t("Nije moguće proceniti isplativost")
                        : t("Čeka analizu")}
                  </strong>
                </span>
              </div>
              {offer.assessments[0] && !calculationReady && (
                <p className="warning-text">{t("Sledeći korak: Zatražite potvrdu podataka i pregovarajte")}</p>
              )}
              {showAnalysisActions && (
                <div className="offer-analysis-action">
                  <button
                    className="primary-button"
                    disabled={!readiness.ready || assessingOfferId === offer.id}
                    onClick={() => void analyzeOffer(offer.id)}
                    title={!readiness.ready ? t(readinessExplanation(readiness)) : undefined}
                    type="button"
                  >
                    {assessingOfferId === offer.id
                      ? t("Analiza je u toku...")
                      : offer.assessments.length > 0
                        ? t("Ponovo analiziraj ponudu")
                        : t("Analiziraj ponudu")}
                  </button>
                  {!readiness.ready && <p className="warning-text">{t(readinessExplanation(readiness))}</p>}
                </div>
              )}
              <ResponsiveOfferDetails summary={t("Prikaži detalje")}>
                <p>
                  {offer.moq
                    ? `${t("Minimalna količina (MOQ)")}: ${offer.moq} ${t("kom")}`
                    : t("Minimalna količina (MOQ) nije navedena")}
                  {classification.kind === "DOMESTIC" ? "" : ` · ${offer.incoterm ?? t("Incoterm nije naveden")}`}
                </p>
                {moq.status === "BLOCKING" && <p className="form-error">{t(moq.message)}</p>}
                <p className="muted-text">{t(classification.reason)}</p>
                {classification.needsSupplierConfirmation && <p className="warning-text">{t("Potrebna potvrda dobavljača")}</p>}
                {isSupplierProductUrl(productUrl) && (
                  <a href={productUrl} rel="noreferrer" target="_blank">{t("Otvori ponudu dobavljača")}</a>
                )}
                <RfqRequestPanel
                  incoterm={offer.incoterm}
                  productTitle={title}
                  productUrl={productUrl}
                  quantity={projectQuantity}
                  supplierName={offer.supplierName}
                  targetCountry={targetCountry}
                />
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
                  classification.kind === "DOMESTIC" ? (
                    <div className="domestic-cost-summary">
                      <strong>{t("Domaća ponuda")}</strong>
                      <p>{t("Kalkulator direktnog uvoza se ne primenjuje na domaću ponudu.")}</p>
                      <dl>
                        <div><dt>{t("Potreban novac po komadu")}</dt><dd>{offer.unitPrice ? `${offer.unitPrice.toString()} ${offer.currency ?? ""}` : t("Nepoznato")}</dd></div>
                        <div><dt>{t("Neto nabavna cena po komadu")}</dt><dd>{typeof data.netPrice === "number" ? `${data.netPrice} ${offer.currency ?? ""}` : t("Nisam siguran")}</dd></div>
                        <div><dt>{t("PDV tretman")}</dt><dd>{data.priceIncludesVat === true ? t("Potencijalno odbitni pretporez — proverite sa knjigovođom") : t("Nisam siguran")}</dd></div>
                      </dl>
                      <p className="warning-text">{t("Ukupna B2B cena se ne računa dok količinska cena i dostupnost nisu potvrđene.")}</p>
                    </div>
                  ) : classification.kind === "DIRECT_IMPORT" && offer.unitPrice && offer.currency && offer.incoterm ? (
                    <CostCalculatorForm
                      key={`${offer.id}-${selectedCalculationOfferId === offer.id ? "edit" : "summary"}`}
                      offerId={offer.id}
                      currency={offer.currency}
                      targetCountry={targetCountry}
                      productName={title}
                      quantity={projectQuantity}
                      sourceMetadata={offer.sourceMetadata}
                      latestCalculation={offer.costCalculations[0]}
                      editInitially={selectedCalculationOfferId === offer.id}
                    />
                  ) : classification.kind === "UNKNOWN" ? (
                    <div className="calculation-requirements">
                      <strong>{t("Prvo potvrdite vrstu ponude")}</strong>
                      <p>{t("Incoterm je potreban samo za direktan uvoz.")}</p>
                    </div>
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
                {showAssessments && <AssessmentPanel calculationReady={calculationReady} offerId={offer.id} assessments={offer.assessments} />}
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
