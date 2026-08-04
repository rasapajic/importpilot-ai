"use client";

import type {
  CostCalculation,
  OfferAssessment,
  SupplierOffer,
} from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CostCalculatorForm } from "@/components/costs/cost-calculator-form";
import { useI18n } from "@/components/i18n/i18n-provider";
import { formatDisplayedPercent } from "@/modules/cost-engine/application/calculation-summary";
import type { LandedCostAssumptions } from "@/modules/cost-engine/domain/serbia-landed-cost";
import { isFinalDecisionStatus } from "@/modules/decisions/application/decision-step-summary";
import { getSimplifiedNextActions } from "@/modules/decisions/application/simplified-next-actions";
import type { ProjectDecisionResult } from "@/modules/decisions/domain/project-decision";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import {
  getStatusLabel,
  translateBusinessText,
  type Locale,
} from "@/modules/i18n/translations";

type DecisionView = ProjectDecisionResult & { id: string; createdAt: Date };

type OfferWithDetails = SupplierOffer & {
  costCalculations: CostCalculation[];
  assessments: OfferAssessment[];
  latestCostAssumptions?: LandedCostAssumptions | null;
};

type SimpleCopy = {
  eyebrow: string;
  question: string;
  check: string;
  checking: string;
  checkAgain: string;
  enterCostsFirst: string;
  readyForCheck: string;
  selectedSupplier: string;
  sellingPrice: string;
  costPerUnit: string;
  profitPerUnit: string;
  totalProfit: string;
  margin: string;
  risk: string;
  nextStep: string;
  howCalculated: string;
  changeCosts: string;
  goodsValue: string;
  transport: string;
  customs: string;
  vat: string;
  clearance: string;
  inspection: string;
  storage: string;
  other: string;
  totalCost: string;
  offerReady: string;
  missingCost: string;
};

const copy: Record<Locale, SimpleCopy> = {
  sr: {
    eyebrow: "Jednostavna provera",
    question: "Da li se isplati?",
    check: "Proveri isplativost",
    checking: "Provera u toku...",
    checkAgain: "Proveri ponovo",
    enterCostsFirst: "Prvo unesite troškove za najmanje jednu ponudu.",
    readyForCheck: "Troškovi su uneti. Jednim klikom dobićete jasnu preporuku.",
    selectedSupplier: "Dobavljač",
    sellingPrice: "Prodajna cena",
    costPerUnit: "Stvarna cena po komadu",
    profitPerUnit: "Zarada po komadu",
    totalProfit: "Ukupna očekivana zarada",
    margin: "Bruto marža",
    risk: "Rizik dobavljača",
    nextStep: "Sledeći korak",
    howCalculated: "Kako je izračunato?",
    changeCosts: "Promeni troškove",
    goodsValue: "Vrednost robe",
    transport: "Transport i osiguranje",
    customs: "Carina",
    vat: "PDV",
    clearance: "Špediter i carinjenje",
    inspection: "Kontrola robe",
    storage: "Skladištenje",
    other: "Ostali troškovi",
    totalCost: "Ukupna nabavna cena",
    offerReady: "Spremno za proveru",
    missingCost: "Unesite troškove ove ponude",
  },
  de: {
    eyebrow: "Einfache Prüfung",
    question: "Lohnt sich der Import?",
    check: "Rentabilität prüfen",
    checking: "Prüfung läuft...",
    checkAgain: "Erneut prüfen",
    enterCostsFirst: "Erfassen Sie zuerst die Kosten für mindestens ein Angebot.",
    readyForCheck: "Die Kosten sind erfasst. Mit einem Klick erhalten Sie eine klare Empfehlung.",
    selectedSupplier: "Lieferant",
    sellingPrice: "Verkaufspreis",
    costPerUnit: "Tatsächliche Stückkosten",
    profitPerUnit: "Gewinn pro Stück",
    totalProfit: "Erwarteter Gesamtgewinn",
    margin: "Bruttomarge",
    risk: "Lieferantenrisiko",
    nextStep: "Nächster Schritt",
    howCalculated: "Wie wurde gerechnet?",
    changeCosts: "Kosten ändern",
    goodsValue: "Warenwert",
    transport: "Transport und Versicherung",
    customs: "Zoll",
    vat: "Mehrwertsteuer",
    clearance: "Spediteur und Zollabfertigung",
    inspection: "Warenkontrolle",
    storage: "Lagerung",
    other: "Sonstige Kosten",
    totalCost: "Gesamteinkaufskosten",
    offerReady: "Bereit zur Prüfung",
    missingCost: "Kosten für dieses Angebot erfassen",
  },
  en: {
    eyebrow: "Simple check",
    question: "Is it profitable?",
    check: "Check profitability",
    checking: "Checking...",
    checkAgain: "Check again",
    enterCostsFirst: "Enter costs for at least one offer first.",
    readyForCheck: "Costs are ready. One click will produce a clear recommendation.",
    selectedSupplier: "Supplier",
    sellingPrice: "Selling price",
    costPerUnit: "True cost per unit",
    profitPerUnit: "Profit per unit",
    totalProfit: "Total expected profit",
    margin: "Gross margin",
    risk: "Supplier risk",
    nextStep: "Next step",
    howCalculated: "How was this calculated?",
    changeCosts: "Change costs",
    goodsValue: "Goods value",
    transport: "Transport and insurance",
    customs: "Customs duty",
    vat: "VAT",
    clearance: "Freight forwarder and customs clearance",
    inspection: "Goods inspection",
    storage: "Storage",
    other: "Other costs",
    totalCost: "Total landed cost",
    offerReady: "Ready to check",
    missingCost: "Enter costs for this offer",
  },
};

function numberValue(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function riskLabel(score: number | null, locale: Locale) {
  if (score === null) {
    return locale === "de" ? "Noch nicht geprüft" : locale === "en" ? "Not checked yet" : "Još nije provereno";
  }
  if (score <= 30) return locale === "de" ? "Niedrig" : locale === "en" ? "Low" : "Nizak";
  if (score <= 55) return locale === "de" ? "Mittel" : locale === "en" ? "Medium" : "Srednji";
  return locale === "de" ? "Hoch" : locale === "en" ? "High" : "Visok";
}

function actionHref(projectId: string, label: string) {
  if (["Predloži poruku", "Traži bolju cenu", "Traži manji MOQ"].includes(label)) {
    return "#negotiation-assistant";
  }
  if (label === "Pronađi nove ponude") return "#workflow-step-offer";
  if (label === "Ubaci drugi link") return `/projects/${projectId}?importUrl=1#workflow-step-offer`;
  if (label === "Izvezi PDF") return `/projects/${projectId}/summary`;
  return "#documents";
}

export function SimpleProfitabilityPanel({
  projectId,
  projectName,
  targetCountry,
  projectQuantity,
  offers,
  decision,
  selectedCalculationOfferId,
  pendingAssessmentOfferIds,
}: {
  projectId: string;
  projectName: string;
  targetCountry: string;
  projectQuantity: number;
  offers: OfferWithDetails[];
  decision: DecisionView | null;
  selectedCalculationOfferId?: string;
  pendingAssessmentOfferIds: string[];
}) {
  const { locale, t } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const calculatedOffers = offers.filter((offer) => offer.costCalculations.length > 0);
  const hasFinalDecision = isFinalDecisionStatus(decision?.status);
  const selectedOffer = decision?.selectedOfferId
    ? offers.find((offer) => offer.id === decision.selectedOfferId) ?? null
    : null;
  const bestOffer = selectedOffer ?? calculatedOffers[0] ?? null;
  const calculation = bestOffer?.costCalculations[0] ?? null;
  const assessment = bestOffer?.assessments[0] ?? null;
  const assumptions = bestOffer?.latestCostAssumptions ?? null;
  const editingOffer = selectedCalculationOfferId
    ? offers.find((offer) => offer.id === selectedCalculationOfferId) ?? null
    : null;

  async function checkProfitability() {
    if (calculatedOffers.length === 0) {
      setError(text.enterCostsFirst);
      return;
    }

    setPending(true);
    setError("");
    try {
      const calculatedOfferIds = new Set(calculatedOffers.map((offer) => offer.id));
      for (const offerId of pendingAssessmentOfferIds) {
        if (!calculatedOfferIds.has(offerId)) continue;
        const assessmentResponse = await fetch(`/api/offers/${offerId}/assessments`, {
          method: "POST",
        });
        if (!assessmentResponse.ok) {
          const payload = (await assessmentResponse.json()) as { error?: string };
          throw new Error(payload.error ?? t("Assessment could not be completed. Please try again."));
        }
      }

      const decisionResponse = await fetch(`/api/projects/${projectId}/decisions`, {
        method: "POST",
      });
      const payload = (await decisionResponse.json()) as { error?: string; status?: string };
      if (!decisionResponse.ok) {
        throw new Error(payload.error ?? t("Odluka nije kreirana. Pokušajte ponovo."));
      }
      if (payload.status === "NEGOTIATE_FIRST") {
        sessionStorage.setItem("focus-negotiation-assistant", "true");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Veza sa serverom nije dostupna. Pokušajte ponovo."));
    } finally {
      setPending(false);
    }
  }

  function money(value: { toString(): string } | number | null | undefined, currency: string) {
    const numeric = numberValue(value);
    if (numeric === null) return t("Unavailable");
    const display = getEuroDisplay(numeric, currency);
    return display.converted ? `${display.original} (≈ ${display.eur})` : display.original;
  }

  if (editingOffer?.unitPrice && editingOffer.currency && editingOffer.incoterm) {
    return (
      <section className="dashboard-card">
        <CostCalculatorForm
          offerId={editingOffer.id}
          unitPrice={editingOffer.unitPrice.toString()}
          currency={editingOffer.currency}
          targetCountry={targetCountry}
          productName={projectName}
          quantity={projectQuantity}
          sourceMetadata={editingOffer.sourceMetadata}
          latestCalculation={editingOffer.costCalculations[0]}
          latestCostAssumptions={editingOffer.latestCostAssumptions}
          editInitially
          showResults={false}
        />
      </section>
    );
  }

  const currency = calculation?.currency ?? bestOffer?.currency ?? "EUR";
  const unitCost = numberValue(calculation?.landedCostPerUnit);
  const sellingPrice = numberValue(calculation?.targetSellingPrice);
  const profitPerUnit = unitCost !== null && sellingPrice !== null ? sellingPrice - unitCost : null;
  const totalProfit = profitPerUnit !== null && calculation ? profitPerUnit * calculation.quantity : null;
  const goodsValue = calculation
    ? numberValue(calculation.unitPrice)! * calculation.quantity
    : null;
  const nextAction = hasFinalDecision && decision
    ? getSimplifiedNextActions(decision.status)[0] ?? null
    : null;

  return (
    <section className="dashboard-card decision-panel decision-summary-card">
      <header className="section-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{hasFinalDecision && decision ? getStatusLabel(decision.status, locale) : text.question}</h2>
        </div>
        <button disabled={pending || calculatedOffers.length === 0} onClick={checkProfitability} type="button">
          {pending ? text.checking : hasFinalDecision ? text.checkAgain : text.check}
        </button>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}

      {hasFinalDecision && decision && calculation && bestOffer ? (
        <>
          <p>{translateBusinessText(decision.decisionReason, locale)}</p>
          <div className="decision-summary-primary">
            <div><span>{text.selectedSupplier}</span><strong>{bestOffer.supplierName}</strong></div>
            <div><span>{text.costPerUnit}</span><strong>{money(calculation.landedCostPerUnit, currency)}</strong></div>
            <div><span>{text.sellingPrice}</span><strong>{money(calculation.targetSellingPrice, currency)}</strong></div>
            <div><span>{text.profitPerUnit}</span><strong>{money(profitPerUnit, currency)}</strong></div>
            <div><span>{text.totalProfit}</span><strong>{money(totalProfit, currency)}</strong></div>
            <div><span>{text.margin}</span><strong>{formatDisplayedPercent(calculation.grossMarginPercent)}%</strong></div>
            <div><span>{text.risk}</span><strong>{riskLabel(numberValue(assessment?.supplierRiskScore), locale)}</strong></div>
          </div>

          {nextAction && (
            <div className="actions">
              <span><strong>{text.nextStep}:</strong> {t(nextAction)}</span>
              <a className="primary-link" href={actionHref(projectId, nextAction)}>{t(nextAction)}</a>
            </div>
          )}

          <details className="advanced-costs">
            <summary>{text.howCalculated}</summary>
            <div className="cost-results">
              <span>{text.goodsValue}: {money(goodsValue, currency)}</span>
              <span>{text.transport}: {money(calculation.shippingCost, currency)}</span>
              <span>{text.customs}: {money(calculation.customsDutyAmount, currency)} ({calculation.customsDutyRate.toString()}%)</span>
              <span>{text.vat}: {money(calculation.vatAmount, currency)} ({calculation.vatRate.toString()}%)</span>
              {assumptions && <span>{text.clearance}: {money(assumptions.customsBrokerCost, currency)}</span>}
              <span>{text.inspection}: {money(calculation.inspectionCost, currency)}</span>
              <span>{text.storage}: {money(calculation.storageCost, currency)}</span>
              <span>{text.other}: {money(assumptions?.otherCosts ?? calculation.otherCosts, currency)}</span>
              <strong>{text.totalCost}: {money(calculation.landedCostTotal, currency)}</strong>
              <Link
                className="secondary-button"
                href={`/projects/${projectId}?editCalculationOffer=${bestOffer.id}#workflow-step-decision`}
              >
                {text.changeCosts}
              </Link>
            </div>
          </details>
        </>
      ) : (
        <>
          {calculatedOffers.length > 0 && <p>{text.readyForCheck}</p>}
          <div className="offer-list">
            {offers.map((offer) => {
              const latest = offer.costCalculations[0];
              if (latest) {
                return (
                  <article className="offer-card" key={offer.id}>
                    <header><strong>{offer.supplierName}</strong><span>{text.offerReady}</span></header>
                    <div className="offer-highlights">
                      <span>{text.costPerUnit}<strong>{money(latest.landedCostPerUnit, latest.currency)}</strong></span>
                      <span>{text.margin}<strong>{formatDisplayedPercent(latest.grossMarginPercent)}%</strong></span>
                      <span>{text.risk}<strong>{riskLabel(numberValue(offer.assessments[0]?.supplierRiskScore), locale)}</strong></span>
                    </div>
                    <Link
                      className="secondary-button"
                      href={`/projects/${projectId}?editCalculationOffer=${offer.id}#workflow-step-decision`}
                    >
                      {text.changeCosts}
                    </Link>
                  </article>
                );
              }

              if (!offer.unitPrice || !offer.currency || !offer.incoterm) return null;
              return (
                <article className="offer-card" key={offer.id}>
                  <h3>{text.missingCost}</h3>
                  <CostCalculatorForm
                    offerId={offer.id}
                    unitPrice={offer.unitPrice.toString()}
                    currency={offer.currency}
                    targetCountry={targetCountry}
                    productName={projectName}
                    quantity={projectQuantity}
                    sourceMetadata={offer.sourceMetadata}
                    latestCostAssumptions={offer.latestCostAssumptions}
                    showResults={false}
                  />
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
