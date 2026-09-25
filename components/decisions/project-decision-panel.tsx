"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FxSourceNote } from "@/components/fx/fx-source-note";
import { useI18n } from "@/components/i18n/i18n-provider";
import { formatDisplayedPercent } from "@/modules/cost-engine/application/calculation-summary";
import { isFinalDecisionStatus } from "@/modules/decisions/application/decision-step-summary";
import {
  getDecisionExpectedProfit,
  getDecisionNextActions,
} from "@/modules/decisions/application/decision-summary";
import type { ProjectDecisionResult } from "@/modules/decisions/domain/project-decision";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import { getStatusLabel } from "@/modules/i18n/translations";

type DecisionView = ProjectDecisionResult & { id: string; createdAt: Date };
type SelectedCalculation = {
  targetSellingPrice: string;
  landedCostPerUnit: string;
  currency: string;
  quantity: number;
};
type AnalyzedOfferSummary = {
  offerId: string;
  productName: string;
  supplierName: string;
  quantity: number;
  unitPrice: string | null;
  currency: string | null;
};

export function ProjectDecisionPanel({
  projectId,
  decision,
  selectedCalculation,
  analyzedOffers,
  assessedOfferCount = 0,
}: {
  projectId: string;
  decision: DecisionView | null;
  selectedCalculation: SelectedCalculation | null;
  analyzedOffers: AnalyzedOfferSummary[];
  assessedOfferCount?: number;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const numberLocale = locale === "sr" ? "sr-Latn" : locale;
  const analysisTitle = analyzedOffers.length === 1
    ? `${t("Analiza ponude")}: ${analyzedOffers[0].supplierName} — ${new Intl.NumberFormat(numberLocale).format(analyzedOffers[0].quantity)} ${t("kom")}`
    : analyzedOffers.length > 1
      ? `${t("Uporedna analiza")} ${analyzedOffers.length} ${t("ponuda")}`
      : t("Da li se isplati?");

  async function generate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/decisions`, { method: "POST" });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) setError(result.error ?? t("Odluka nije kreirana. Pokušajte ponovo."));
      else {
        if (result.status === "NEGOTIATE_FIRST") {
          sessionStorage.setItem("focus-negotiation-assistant", "true");
        }
        router.refresh();
      }
    } catch {
      setError(t("Veza sa serverom nije dostupna. Pokušajte ponovo."));
    } finally {
      setPending(false);
    }
  }

  const hasFinalRecommendation = isFinalDecisionStatus(decision?.status);
  const summary = hasFinalRecommendation ? decision?.summarySnapshot : null;
  const best = summary?.bestOverallOffer ?? null;
  const expectedProfit = getDecisionExpectedProfit(selectedCalculation);
  const expectedProfitDisplay = expectedProfit && selectedCalculation
    ? getEuroDisplay(expectedProfit, selectedCalculation.currency)
    : null;
  const landedCostDisplay = best?.landedCostPerUnit !== null && best?.landedCostPerUnit !== undefined
    ? getEuroDisplay(best.landedCostPerUnit, best.currency)
    : null;
  const nextActions = hasFinalRecommendation && decision ? getDecisionNextActions(decision.status, decision.actionChecklist) : [];
  const supplierRiskLevel = best?.assessment?.supplierRiskLevel;
  const supplierRiskLabel =
    supplierRiskLevel === "LOW"
      ? "Nizak rizik"
      : supplierRiskLevel === "MEDIUM"
        ? "Srednji rizik"
        : supplierRiskLevel === "HIGH"
          ? "Visok rizik"
          : "Rizik nepoznat";

  return (
    <section className="dashboard-card decision-panel decision-summary-card">
      <header className="section-header">
        <div>
          <p className="eyebrow">{t("Preporuka")}</p>
          <h2>{analysisTitle}</h2>
        </div>
        <div className="actions">
          <button disabled={pending || analyzedOffers.length === 0} onClick={generate} type="button">
            {pending ? t("Generating...") : hasFinalRecommendation ? t("Save decision") : t("Generate recommendation")}
          </button>
          {hasFinalRecommendation && <Link className="secondary-link" href={`/projects/${projectId}/summary`}>{t("Izvezi PDF")}</Link>}
          <Link className="secondary-link" href="#workflow-step-offer">{t("Nova analiza")}</Link>
        </div>
      </header>
      {analyzedOffers.length > 0 ? (
        <div className="analyzed-offer-list" aria-label={t("Ponude uključene u analizu")}>
          {analyzedOffers.map((offer) => (
            <article className="analyzed-offer-summary" key={offer.offerId}>
              <strong>{offer.productName}</strong>
              <span>{offer.supplierName}</span>
              <span>{new Intl.NumberFormat(numberLocale).format(offer.quantity)} {t("kom")}</span>
              <span>{offer.unitPrice && offer.currency ? `${offer.unitPrice} ${offer.currency}` : t("Cena nije navedena")}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="warning-text">{assessedOfferCount > 0
          ? t("Analizirane ponude još nemaju kompletan potvrđen obračun. Potvrdite sve troškove pre preporuke.")
          : t("Izaberite i analizirajte najmanje jednu kompletnu ponudu. Potrebni su dobavljač, cena, valuta i MOQ.")}</p>
      )}
      {error && <p className="form-error">{error}</p>}
      {hasFinalRecommendation && decision && summary ? (
        <>
          <div className="decision-summary-primary">
            <div>
              <span>{t("Preporuka")}</span>
              <strong className="decision-status">{getStatusLabel(decision.status, locale)}</strong>
            </div>
            <div>
              <span>{t("Izabrani dobavljač")}</span>
              <strong>{best?.supplierName ?? t("Unavailable")}</strong>
            </div>
            <div>
              <span>{t("Očekivana zarada")}</span>
              <strong>
                {expectedProfitDisplay?.eur ?? expectedProfitDisplay?.original ?? t("Unavailable")}
                {expectedProfitDisplay?.converted ? ` (${expectedProfitDisplay.original})` : ""}
              </strong>
            </div>
          </div>
          <div className="decision-summary-columns">
            <div>
              <h3>{t("Glavni razlog")}</h3>
              <dl className="decision-reason-list">
                {selectedCalculation && (
                  <div>
                    <dt>{t("Prodajna cena")}</dt>
                    <dd>{selectedCalculation.targetSellingPrice} {selectedCalculation.currency} · {t("Unos korisnika")}</dd>
                  </div>
                )}
                <div>
                  <dt>{t("Očekivana marža")}</dt>
                  <dd>{best?.grossMarginPercent !== null && best?.grossMarginPercent !== undefined ? `${formatDisplayedPercent(best.grossMarginPercent)}%` : t("Unavailable")}</dd>
                </div>
                <div>
                  <dt>{t("Realna cena po komadu")}</dt>
                  <dd>{landedCostDisplay?.eur ?? landedCostDisplay?.original ?? t("Unavailable")}{landedCostDisplay?.converted ? ` (${landedCostDisplay.original})` : ""}</dd>
                </div>
                <div>
                  <dt>{t("Rizik dobavljača")}</dt>
                  <dd>{best?.assessment ? `${t(supplierRiskLabel)} · ${best.assessment.supplierRiskScore}/100` : t("Unavailable")}</dd>
                </div>
                <div>
                  <dt>{t("MOQ status")}</dt>
                  <dd>{best?.moqStatus ? t(best.moqStatus.label) : best?.moqExceedsProjectQuantity === null || best?.moqExceedsProjectQuantity === undefined ? t("Not provided") : best.moqExceedsProjectQuantity ? t("MOQ exceeds project quantity") : t("MOQ fits project quantity")}</dd>
                </div>
                <div>
                  <dt>{t("Pouzdanost isporuke")}</dt>
                  <dd>{best?.shippingClarityScore ?? t("Unavailable")}{best?.shippingClarityScore !== null && best?.shippingClarityScore !== undefined ? "/100" : ""}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3>{t("Sledeći korak")}</h3>
              <ul className="checklist">
                {nextActions.map((action) => <li key={action}><strong>{t(action)}</strong></li>)}
              </ul>
            </div>
          </div>
          <details className="fx-details">
            <summary>{t("FX details")}</summary>
            <FxSourceNote />
          </details>
        </>
      ) : (
        <div className="empty-state">
          <h3>{t("Još nema preporuke.")}</h3>
          <p>{t("Proverite realnu cenu i analizu ponuda, pa generišite preporuku.")}</p>
        </div>
      )}
    </section>
  );
}
