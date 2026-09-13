"use client";

import type {
  CostCalculation,
  OfferAssessment,
  SupplierOffer,
} from "@prisma/client";
import Link from "next/link";

import { CostCalculatorForm } from "@/components/costs/cost-calculator-form";
import { useI18n } from "@/components/i18n/i18n-provider";
import { CommercialTermsForm } from "@/components/offers/commercial-terms-form";
import { ProfitabilityCheckControl } from "@/components/projects/profitability-check-control";
import { formatDisplayedPercent } from "@/modules/cost-engine/application/calculation-summary";
import type { LandedCostAssumptions } from "@/modules/cost-engine/domain/serbia-landed-cost";
import { getClientDecisionSummary } from "@/modules/decisions/application/client-decision-summary";
import {
  getDecisionStepTitle,
  isFinalDecisionStatus,
} from "@/modules/decisions/application/decision-step-summary";
import type { ProjectDecisionResult } from "@/modules/decisions/domain/project-decision";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import type { Locale } from "@/modules/i18n/translations";

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
  supplierPrice: string;
  supplierCountry: string;
  moq: string;
  incoterm: string;
  delivery: string;
  days: string;
  offerDetail: string;
  sourceOffer: string;
  commercialDataMissing: string;
  costPerUnit: string;
  profitPerUnit: string;
  totalProfit: string;
  margin: string;
  risk: string;
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
  unknown: string;
};

const copy: Record<Locale, SimpleCopy> = {
  sr: {
    eyebrow: "Jednostavna provera",
    question: "Da li se isplati?",
    check: "Proveri isplativost",
    checking: "Provera u toku...",
    checkAgain: "Proveri ponovo",
    enterCostsFirst: "Prvo završite računicu za izabranu ponudu.",
    readyForCheck: "Računica je spremna. Jednim klikom dobićete jasnu odluku.",
    selectedSupplier: "Dobavljač",
    sellingPrice: "Prodajna cena",
    supplierPrice: "Cena dobavljača",
    supplierCountry: "Zemlja dobavljača",
    moq: "MOQ",
    incoterm: "Incoterm",
    delivery: "Rok isporuke",
    days: "dana",
    offerDetail: "Izabrana ponuda",
    sourceOffer: "Otvori izvornu ponudu",
    commercialDataMissing: "Nedostaju podaci potrebni za računicu.",
    costPerUnit: "Stvarna cena po komadu",
    profitPerUnit: "Zarada po komadu",
    totalProfit: "Ukupna očekivana zarada",
    margin: "Bruto marža",
    risk: "Rizik dobavljača",
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
    missingCost: "Unesite prodajnu cenu i proverite uvozne troškove",
    unknown: "nije poznato",
  },
  de: {
    eyebrow: "Einfache Prüfung",
    question: "Lohnt sich der Import?",
    check: "Rentabilität prüfen",
    checking: "Prüfung läuft...",
    checkAgain: "Erneut prüfen",
    enterCostsFirst: "Schließen Sie zuerst die Kalkulation für das ausgewählte Angebot ab.",
    readyForCheck: "Die Kalkulation ist bereit. Mit einem Klick erhalten Sie eine klare Entscheidung.",
    selectedSupplier: "Lieferant",
    sellingPrice: "Verkaufspreis",
    supplierPrice: "Lieferantenpreis",
    supplierCountry: "Lieferantenland",
    moq: "MOQ",
    incoterm: "Incoterm",
    delivery: "Lieferzeit",
    days: "Tage",
    offerDetail: "Ausgewähltes Angebot",
    sourceOffer: "Quellangebot öffnen",
    commercialDataMissing: "Für die Kalkulation fehlen erforderliche Angebotsdaten.",
    costPerUnit: "Tatsächliche Stückkosten",
    profitPerUnit: "Gewinn pro Stück",
    totalProfit: "Erwarteter Gesamtgewinn",
    margin: "Bruttomarge",
    risk: "Lieferantenrisiko",
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
    missingCost: "Verkaufspreis eingeben und Importkosten prüfen",
    unknown: "unbekannt",
  },
  en: {
    eyebrow: "Simple check",
    question: "Is it profitable?",
    check: "Check profitability",
    checking: "Checking...",
    checkAgain: "Check again",
    enterCostsFirst: "Complete the calculation for the selected offer first.",
    readyForCheck: "The calculation is ready. One click will produce a clear decision.",
    selectedSupplier: "Supplier",
    sellingPrice: "Selling price",
    supplierPrice: "Supplier price",
    supplierCountry: "Supplier country",
    moq: "MOQ",
    incoterm: "Incoterm",
    delivery: "Delivery time",
    days: "days",
    offerDetail: "Selected offer",
    sourceOffer: "Open source offer",
    commercialDataMissing: "Required commercial data is missing for the calculation.",
    costPerUnit: "True cost per unit",
    profitPerUnit: "Profit per unit",
    totalProfit: "Total expected profit",
    margin: "Gross margin",
    risk: "Supplier risk",
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
    missingCost: "Enter selling price and review import costs",
    unknown: "unknown",
  },
};

function numberValue(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceOfferUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const source = metadata as Record<string, unknown>;
  const value = source.sourceUrl ?? source.productUrl;
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function riskLabel(score: number | null, locale: Locale) {
  if (score === null) {
    return locale === "de" ? "Noch nicht geprüft" : locale === "en" ? "Not checked yet" : "Još nije provereno";
  }
  if (score <= 30) return locale === "de" ? "Niedrig" : locale === "en" ? "Low" : "Nizak";
  if (score <= 55) return locale === "de" ? "Mittel" : locale === "en" ? "Medium" : "Srednji";
  return locale === "de" ? "Hoch" : locale === "en" ? "High" : "Visok";
}

export function SimpleProfitabilityPanel({
  projectId,
  projectName,
  targetCountry,
  projectQuantity,
  offers,
  decision,
  focusedOfferId,
  selectedCalculationOfferId,
  profitabilityError,
}: {
  projectId: string;
  projectName: string;
  targetCountry: string;
  projectQuantity: number;
  offers: OfferWithDetails[];
  decision: DecisionView | null;
  focusedOfferId?: string;
  selectedCalculationOfferId?: string;
  profitabilityError?: string;
}) {
  const { locale, t } = useI18n();
  const text = copy[locale];
  const calculatedOffers = offers.filter((offer) => offer.costCalculations.length > 0);
  const projectHasFinalDecision = isFinalDecisionStatus(decision?.status);
  const decisionOffer = decision?.selectedOfferId
    ? offers.find((offer) => offer.id === decision.selectedOfferId) ?? null
    : null;
  const focusedOffer = focusedOfferId
    ? offers.find((offer) => offer.id === focusedOfferId) ?? null
    : null;
  const hasFinalDecision = projectHasFinalDecision && (
    !focusedOffer || decision?.selectedOfferId === focusedOffer.id
  );
  const bestOffer = focusedOffer ?? decisionOffer ?? calculatedOffers[0] ?? null;
  const calculation = bestOffer?.costCalculations[0] ?? null;
  const assessment = bestOffer?.assessments[0] ?? null;
  const assumptions = bestOffer?.latestCostAssumptions ?? null;
  const editingOffer = selectedCalculationOfferId
    ? offers.find((offer) => offer.id === selectedCalculationOfferId) ?? null
    : null;
  const offersForInput = focusedOffer ? [focusedOffer] : offers;
  const canCheckProfitability = focusedOffer
    ? focusedOffer.costCalculations.length > 0
    : calculatedOffers.length > 0;

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
  const decisionSummary = hasFinalDecision && decision && bestOffer
    ? getClientDecisionSummary({
        locale,
        offerCount: decision.summarySnapshot.offerCount,
        supplierName: bestOffer.supplierName,
        overallScore: numberValue(assessment?.overallScore),
      })
    : "";

  return (
    <section className="dashboard-card decision-panel decision-summary-card">
      <header className="section-header">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{hasFinalDecision && decision
            ? getDecisionStepTitle(decision.status, locale)
            : text.question}</h2>
        </div>
        {(canCheckProfitability || hasFinalDecision) && (
          <ProfitabilityCheckControl
            disabled={!canCheckProfitability}
            idleLabel={hasFinalDecision ? text.checkAgain : text.check}
            pendingLabel={text.checking}
            projectId={projectId}
          />
        )}
      </header>

      {profitabilityError && (
        <p className="form-error" role="alert">
          {profitabilityError === "NO_CALCULATED_OFFERS"
            ? text.enterCostsFirst
            : locale === "de"
              ? "Die Prüfung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut."
              : locale === "en"
                ? "The profitability check could not be completed. Please try again."
                : "Provera isplativosti nije završena. Pokušajte ponovo."}
        </p>
      )}

      {hasFinalDecision && decision && calculation && bestOffer ? (
        <>
          <p>{decisionSummary}</p>
          <div className="decision-summary-primary">
            <div><span>{text.selectedSupplier}</span><strong>{bestOffer.supplierName}</strong></div>
            <div><span>{text.costPerUnit}</span><strong>{money(calculation.landedCostPerUnit, currency)}</strong></div>
            <div><span>{text.sellingPrice}</span><strong>{money(calculation.targetSellingPrice, currency)}</strong></div>
            <div><span>{text.profitPerUnit}</span><strong>{money(profitPerUnit, currency)}</strong></div>
            <div><span>{text.totalProfit}</span><strong>{money(totalProfit, currency)}</strong></div>
            <div><span>{text.margin}</span><strong>{formatDisplayedPercent(calculation.grossMarginPercent)}%</strong></div>
            <div><span>{text.risk}</span><strong>{riskLabel(numberValue(assessment?.supplierRiskScore), locale)}</strong></div>
          </div>

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
                href={`/projects/${projectId}?selectedOffer=${bestOffer.id}&editCalculationOffer=${bestOffer.id}#workflow-step-decision`}
              >
                {text.changeCosts}
              </Link>
            </div>
          </details>
        </>
      ) : (
        <>
          {canCheckProfitability && <p>{text.readyForCheck}</p>}
          <div className="offer-list">
            {offersForInput.map((offer) => {
              const latest = offer.costCalculations[0];
              const sourceUrl = sourceOfferUrl(offer.sourceMetadata);
              const commercialTermsComplete = Boolean(
                offer.unitPrice && offer.currency && offer.incoterm,
              );

              return (
                <article className="offer-card" key={offer.id}>
                  <header>
                    <div>
                      <p className="eyebrow">{text.offerDetail}</p>
                      <strong>{offer.supplierName}</strong>
                    </div>
                    {latest && <span>{text.offerReady}</span>}
                  </header>

                  <div className="offer-highlights">
                    <span>{text.supplierPrice}<strong>{offer.unitPrice && offer.currency ? money(offer.unitPrice, offer.currency) : text.unknown}</strong></span>
                    <span>{text.moq}<strong>{offer.moq ?? text.unknown}</strong></span>
                    <span>{text.incoterm}<strong>{offer.incoterm ?? text.unknown}</strong></span>
                    <span>{text.delivery}<strong>{offer.deliveryTimeDays === null ? text.unknown : `${offer.deliveryTimeDays} ${text.days}`}</strong></span>
                    <span>{text.supplierCountry}<strong>{offer.supplierCountry ?? text.unknown}</strong></span>
                  </div>

                  {sourceUrl && (
                    <p><a href={sourceUrl} rel="noreferrer" target="_blank">{text.sourceOffer}</a></p>
                  )}

                  {latest ? (
                    <>
                      <div className="offer-highlights">
                        <span>{text.costPerUnit}<strong>{money(latest.landedCostPerUnit, latest.currency)}</strong></span>
                        <span>{text.margin}<strong>{formatDisplayedPercent(latest.grossMarginPercent)}%</strong></span>
                        <span>{text.risk}<strong>{riskLabel(numberValue(offer.assessments[0]?.supplierRiskScore), locale)}</strong></span>
                      </div>
                      <Link
                        className="secondary-button"
                        href={`/projects/${projectId}?selectedOffer=${offer.id}&editCalculationOffer=${offer.id}#workflow-step-decision`}
                      >
                        {text.changeCosts}
                      </Link>
                    </>
                  ) : !commercialTermsComplete ? (
                    <>
                      <p className="warning-text">{text.commercialDataMissing}</p>
                      <CommercialTermsForm
                        offerId={offer.id}
                        unitPrice={offer.unitPrice?.toString() ?? null}
                        currency={offer.currency}
                        incoterm={offer.incoterm}
                        deliveryTimeDays={offer.deliveryTimeDays}
                      />
                    </>
                  ) : (
                    <>
                      <h3>{text.missingCost}</h3>
                      <CostCalculatorForm
                        offerId={offer.id}
                        unitPrice={offer.unitPrice!.toString()}
                        currency={offer.currency!}
                        targetCountry={targetCountry}
                        productName={projectName}
                        quantity={projectQuantity}
                        sourceMetadata={offer.sourceMetadata}
                        latestCostAssumptions={offer.latestCostAssumptions}
                        showResults={false}
                      />
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}