"use client";

import type {
  CostCalculation,
  OfferAssessment,
  SupplierOffer,
} from "@prisma/client";
import Link from "next/link";
import { useEffect, useState } from "react";

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
import { getEuroDisplay, type FxSnapshot } from "@/modules/fx/euro-display";
import { getCountryDisplayName } from "@/modules/i18n/country-names";
import type { Locale } from "@/modules/i18n/translations";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import { estimateTajaPreliminaryLandedCost } from "@/modules/product-search/domain/taja-preliminary-cost-estimate";
import { extractSupplierLogisticsData } from "@/modules/transport/domain/transport-estimator";

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
  unit: string;
  offerDetail: string;
  sourceOffer: string;
  commercialDataMissing: string;
  preliminaryEstimateTitle: string;
  preliminaryEstimateBody: string;
  preliminaryBase: string;
  preliminaryRange: string;
  assumedIncoterm: string;
  estimatedTransportTime: string;
  confirmActualTerms: string;
  costPerUnit: string;
  estimatedCostPerUnit: string;
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
  estimatedTotalCost: string;
  costNeedsReview: string;
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
    moq: "Minimalna količina (MOQ)",
    incoterm: "Uslov isporuke (Incoterm)",
    delivery: "Rok isporuke",
    days: "dana",
    unit: "kom",
    offerDetail: "Izabrana ponuda",
    sourceOffer: "Otvori izvornu ponudu",
    commercialDataMissing: "Nedostaju cena ili valuta potrebni za računicu.",
    preliminaryEstimateTitle: "Preliminarna procena uvoza",
    preliminaryEstimateBody: "JAKOV360 može da napravi konzervativnu procenu i pre potvrde Incoterm-a. Nepotvrđeni podaci su jasno označeni i ne predstavljaju uslov dobavljača.",
    preliminaryBase: "Osnovna procena",
    preliminaryRange: "Raspon procene",
    assumedIncoterm: "EXW — pretpostavka za procenu",
    estimatedTransportTime: "procena transporta",
    confirmActualTerms: "Potvrdite stvarni Incoterm kod dobavljača pre konačne odluke ili narudžbine.",
    costPerUnit: "Potvrđena cena po komadu",
    estimatedCostPerUnit: "Procenjena cena po komadu",
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
    totalCost: "Potvrđena ukupna nabavna cena",
    estimatedTotalCost: "Procenjena ukupna nabavna cena",
    costNeedsReview: "Transport i/ili carinska stopa još nisu potvrđeni. Ovaj trošak je procena i zahteva proveru pre kupovine.",
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
    unit: "Stk.",
    offerDetail: "Ausgewähltes Angebot",
    sourceOffer: "Quellangebot öffnen",
    commercialDataMissing: "Für die Kalkulation fehlen Preis oder Währung.",
    preliminaryEstimateTitle: "Vorläufige Importkostenschätzung",
    preliminaryEstimateBody: "JAKOV360 kann vor der Bestätigung des Incoterms eine konservative Schätzung erstellen. Unbestätigte Angaben sind klar gekennzeichnet und gelten nicht als Lieferantenkonditionen.",
    preliminaryBase: "Basisschätzung",
    preliminaryRange: "Schätzbereich",
    assumedIncoterm: "EXW — Annahme für die Schätzung",
    estimatedTransportTime: "Transport-Schätzung",
    confirmActualTerms: "Bestätigen Sie den tatsächlichen Incoterm beim Lieferanten vor der endgültigen Entscheidung oder Bestellung.",
    costPerUnit: "Bestätigte Stückkosten",
    estimatedCostPerUnit: "Geschätzte Stückkosten",
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
    totalCost: "Bestätigte Gesamteinkaufskosten",
    estimatedTotalCost: "Geschätzte Gesamteinkaufskosten",
    costNeedsReview: "Transport und/oder Zollsatz sind noch nicht bestätigt. Diese Kosten sind eine Schätzung und müssen vor dem Kauf geprüft werden.",
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
    unit: "pcs",
    offerDetail: "Selected offer",
    sourceOffer: "Open source offer",
    commercialDataMissing: "A supplier price or currency is missing for the calculation.",
    preliminaryEstimateTitle: "Preliminary import estimate",
    preliminaryEstimateBody: "JAKOV360 can produce a conservative estimate before the Incoterm is confirmed. Unconfirmed values are clearly labeled and are not supplier terms.",
    preliminaryBase: "Base estimate",
    preliminaryRange: "Estimated range",
    assumedIncoterm: "EXW — planning assumption",
    estimatedTransportTime: "transport estimate",
    confirmActualTerms: "Confirm the actual Incoterm with the supplier before a final decision or order.",
    costPerUnit: "Confirmed cost per unit",
    estimatedCostPerUnit: "Estimated cost per unit",
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
    totalCost: "Confirmed total landed cost",
    estimatedTotalCost: "Estimated total landed cost",
    costNeedsReview: "Transport and/or the customs rate are not confirmed yet. This cost is an estimate and must be verified before purchase.",
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

function metadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function preliminarySearchResult(
  offer: OfferWithDetails,
  projectName: string,
): SupplierOfferSearchResult | null {
  const productUrl = sourceOfferUrl(offer.sourceMetadata);
  const price = numberValue(offer.unitPrice);
  if (!productUrl || price === null || !offer.currency) return null;
  const extractedLogistics = extractSupplierLogisticsData(offer.sourceMetadata);
  const supplierLogistics = extractedLogistics &&
    (extractedLogistics.evidence === "PRODUCT_PAGE" || extractedLogistics.evidence === "SEARCH_SNIPPET")
    ? {
        grossWeightKg: extractedLogistics.grossWeightKg ?? null,
        netWeightKg: extractedLogistics.netWeightKg ?? null,
        cartonLengthCm: extractedLogistics.cartonLengthCm ?? null,
        cartonWidthCm: extractedLogistics.cartonWidthCm ?? null,
        cartonHeightCm: extractedLogistics.cartonHeightCm ?? null,
        piecesPerCarton: extractedLogistics.piecesPerCarton ?? null,
        unitWeightKg: extractedLogistics.unitWeightKg ?? null,
        unitVolumeCbm: extractedLogistics.unitVolumeCbm ?? null,
        evidence: extractedLogistics.evidence,
      }
    : undefined;

  return {
    title: metadataText(offer.sourceMetadata, "title") ?? projectName,
    supplierName: offer.supplierName,
    supplierCountry: offer.supplierCountry,
    price,
    currency: offer.currency,
    minimumOrderQuantity: offer.moq,
    incoterm: offer.incoterm,
    productUrl,
    imageUrl: metadataText(offer.sourceMetadata, "imageUrl"),
    source: metadataText(offer.sourceMetadata, "providerSource") ??
      metadataText(offer.sourceMetadata, "sourceHost") ??
      "saved supplier offer",
    supplierLogistics,
  };
}

function riskLabel(score: number | null, locale: Locale) {
  if (score === null) {
    return locale === "de" ? "Noch nicht geprüft" : locale === "en" ? "Not checked yet" : "Još nije provereno";
  }
  if (score <= 30) return locale === "de" ? "Niedrig" : locale === "en" ? "Low" : "Nizak";
  if (score <= 55) return locale === "de" ? "Mittel" : locale === "en" ? "Medium" : "Srednji";
  return locale === "de" ? "Hoch" : locale === "en" ? "High" : "Visok";
}

function isFxSnapshotPayload(value: unknown): value is FxSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.baseCurrency === "EUR" &&
    typeof record.source === "string" &&
    typeof record.timestamp === "string" &&
    Boolean(record.ratesToEur) &&
    typeof record.ratesToEur === "object" &&
    !Array.isArray(record.ratesToEur);
}

function importCostNeedsReview(assumptions: LandedCostAssumptions | null | undefined) {
  return Boolean(
    assumptions && (!assumptions.transportConfirmed || !assumptions.customsDutyConfirmed),
  );
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
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null);
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
  const needsFx = Boolean(
    (calculation?.currency && calculation.currency !== "EUR") ||
    offersForInput.some((offer) => offer.currency && offer.currency !== "EUR"),
  );

  useEffect(() => {
    if (!needsFx) return;
    const controller = new AbortController();
    void fetch("/api/fx/latest", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isFxSnapshotPayload(payload)) return;
        setFxSnapshot(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [needsFx]);

  function money(value: { toString(): string } | number | null | undefined, currency: string) {
    const numeric = numberValue(value);
    if (numeric === null) return t("Unavailable");
    if (currency !== "EUR" && !fxSnapshot) {
      return `${numeric.toFixed(2)} ${currency}`;
    }
    const display = getEuroDisplay(numeric, currency, fxSnapshot ?? undefined);
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
  const calculationNeedsReview = Boolean(calculation && importCostNeedsReview(assumptions));
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
          {calculationNeedsReview && <p className="warning-text">{text.costNeedsReview}</p>}
          <div className="decision-summary-primary">
            <div><span>{text.selectedSupplier}</span><strong>{bestOffer.supplierName}</strong></div>
            <div><span>{calculationNeedsReview ? text.estimatedCostPerUnit : text.costPerUnit}</span><strong>{money(calculation.landedCostPerUnit, currency)}</strong></div>
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
              <strong>{calculationNeedsReview ? text.estimatedTotalCost : text.totalCost}: {money(calculation.landedCostTotal, currency)}</strong>
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
              const priceDataComplete = Boolean(offer.unitPrice && offer.currency);
              const commercialTermsComplete = Boolean(
                offer.unitPrice && offer.currency && offer.incoterm,
              );
              const planningResult = preliminarySearchResult(offer, projectName);
              const preliminaryEstimate = planningResult
                ? estimateTajaPreliminaryLandedCost({
                    result: planningResult,
                    quantity: projectQuantity,
                    targetCountry,
                    targetMarginPercent: 0,
                    fxSnapshot: planningResult.currency === "EUR" ? undefined : fxSnapshot,
                  })
                : null;
              const displayedIncoterm = offer.incoterm ??
                (preliminaryEstimate?.pricingBasisAssumed ? text.assumedIncoterm : text.unknown);
              const displayedSupplierCountry = offer.supplierCountry
                ? getCountryDisplayName(offer.supplierCountry, locale)
                : text.unknown;
              const displayedDelivery = offer.deliveryTimeDays === null
                ? preliminaryEstimate
                  ? `${preliminaryEstimate.deliveryTimeDays} (${text.estimatedTransportTime})`
                  : text.unknown
                : `${offer.deliveryTimeDays} ${text.days}`;
              const offerCostNeedsReview = Boolean(
                latest && importCostNeedsReview(offer.latestCostAssumptions),
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
                    <span>{text.incoterm}<strong>{displayedIncoterm}</strong></span>
                    <span>{text.delivery}<strong>{displayedDelivery}</strong></span>
                    <span>{text.supplierCountry}<strong>{displayedSupplierCountry}</strong></span>
                  </div>

                  {sourceUrl && (
                    <p><a href={sourceUrl} rel="noreferrer" target="_blank">{text.sourceOffer}</a></p>
                  )}

                  {latest ? (
                    <>
                      {offerCostNeedsReview && <p className="warning-text">{text.costNeedsReview}</p>}
                      <div className="offer-highlights">
                        <span>{offerCostNeedsReview ? text.estimatedCostPerUnit : text.costPerUnit}<strong>{money(latest.landedCostPerUnit, latest.currency)}</strong></span>
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
                      {!priceDataComplete && (
                        <p className="warning-text">{text.commercialDataMissing}</p>
                      )}
                      {priceDataComplete && preliminaryEstimate && (
                        <section className="preliminary-import-estimate">
                          <h3>{text.preliminaryEstimateTitle}</h3>
                          <p>{text.preliminaryEstimateBody}</p>
                          <div className="offer-highlights">
                            <span>
                              {text.preliminaryBase}
                              <strong>≈ {money(preliminaryEstimate.basePerUnitEur, "EUR")} / {text.unit}</strong>
                            </span>
                            <span>
                              {text.preliminaryRange}
                              <strong>
                                {money(preliminaryEstimate.lowPerUnitEur, "EUR")} – {money(preliminaryEstimate.highPerUnitEur, "EUR")} / {text.unit}
                              </strong>
                            </span>
                            <span>
                              {text.incoterm}
                              <strong>{preliminaryEstimate.pricingBasisAssumed ? text.assumedIncoterm : preliminaryEstimate.pricingBasisIncoterm}</strong>
                            </span>
                            <span>
                              {text.delivery}
                              <strong>{preliminaryEstimate.deliveryTimeDays} ({text.estimatedTransportTime})</strong>
                            </span>
                          </div>
                          <p className="warning-text">{text.confirmActualTerms}</p>
                        </section>
                      )}
                      <CommercialTermsForm
                        offerId={offer.id}
                        unitPrice={offer.unitPrice?.toString() ?? null}
                        currency={offer.currency}
                        incoterm={offer.incoterm}
                        deliveryTimeDays={offer.deliveryTimeDays}
                        planningIncoterm={preliminaryEstimate?.pricingBasisAssumed ? "EXW" : null}
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
