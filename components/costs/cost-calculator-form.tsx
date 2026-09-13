"use client";

import type { CostCalculation } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TransportCostAssistant } from "@/components/costs/transport-cost-assistant";
import { getLandedCostCopy } from "@/components/costs/landed-cost-copy";
import { FxSourceNote } from "@/components/fx/fx-source-note";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getCalculationFormValues } from "@/modules/cost-engine/application/calculation-form-values";
import {
  formatDisplayedPercent,
  getDisplayedProfitSummary,
} from "@/modules/cost-engine/application/calculation-summary";
import { getImportCountryProfile } from "@/modules/cost-engine/domain/import-country-profiles";
import {
  sumCostAmounts,
  type LandedCostAssumptions,
} from "@/modules/cost-engine/domain/serbia-landed-cost";
import { getAutomaticVatRate, resolveVatRate } from "@/modules/cost-engine/domain/vat-rates";
import {
  convertFromEur,
  convertToEur,
  DEFAULT_EUR_FX_SNAPSHOT,
  getEuroDisplay,
  type FxSnapshot,
} from "@/modules/fx/euro-display";
import { getStatusLabel } from "@/modules/i18n/translations";

function safeAmount(value: string) {
  return value.trim() || "0";
}

function isFxSnapshotPayload(value: unknown): value is FxSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.baseCurrency !== "EUR" || typeof record.source !== "string" || typeof record.timestamp !== "string") {
    return false;
  }
  if (!record.ratesToEur || typeof record.ratesToEur !== "object" || Array.isArray(record.ratesToEur)) {
    return false;
  }
  return true;
}

function getSafeEuroDisplay(
  value: number | string | { toString(): string },
  currency: string,
  snapshot: FxSnapshot | null,
) {
  if (currency === "EUR") return getEuroDisplay(value, currency, DEFAULT_EUR_FX_SNAPSHOT);
  if (snapshot) return getEuroDisplay(value, currency, snapshot);
  const numeric = Number(value.toString());
  return {
    original: Number.isFinite(numeric) ? `${numeric.toFixed(2)} ${currency}` : null,
    eur: null,
    converted: false,
  };
}

export function CostCalculatorForm({
  offerId,
  unitPrice,
  currency,
  targetCountry,
  productName,
  quantity,
  sourceMetadata,
  latestCalculation,
  latestCostAssumptions,
  editInitially = false,
  showResults = true,
}: {
  offerId: string;
  unitPrice: string;
  currency: string;
  targetCountry: string;
  productName: string;
  quantity: number;
  sourceMetadata?: unknown;
  latestCalculation?: CostCalculation;
  latestCostAssumptions?: LandedCostAssumptions | null;
  editInitially?: boolean;
  showResults?: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const profile = getImportCountryProfile(targetCountry);
  const isPrimaryCountry = profile !== null;
  const automaticVatRate = profile?.defaultVatRate ?? getAutomaticVatRate(targetCountry);
  const copy = getLandedCostCopy(locale, targetCountry, automaticVatRate);
  const values = getCalculationFormValues(latestCalculation, latestCostAssumptions);
  const previousVatIsOverride = Boolean(
    latestCalculation &&
    (values.vatSource === "MANUAL_OVERRIDE" ||
      automaticVatRate === null ||
      Number(values.vatRate) !== Number(automaticVatRate)),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(!latestCalculation || editInitially);
  const [shippingCost, setShippingCost] = useState(values.shippingCost);
  const [chinaDomesticTransportCost, setChinaDomesticTransportCost] = useState(values.chinaDomesticTransportCost);
  const [internationalTransportCost, setInternationalTransportCost] = useState(values.internationalTransportCost);
  const [insuranceCost, setInsuranceCost] = useState(values.insuranceCost);
  const [overrideVat, setOverrideVat] = useState(previousVatIsOverride);
  const [manualVatRate, setManualVatRate] = useState(previousVatIsOverride ? values.vatRate : "");
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(
    currency === "EUR" ? DEFAULT_EUR_FX_SNAPSHOT : null,
  );
  const [fxStatus, setFxStatus] = useState<"ready" | "loading" | "error">(
    currency === "EUR" ? "ready" : "loading",
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveVatRate = resolveVatRate(targetCountry, overrideVat ? manualVatRate : null) ?? "";
  const profit = latestCalculation ? getDisplayedProfitSummary(latestCalculation) : null;
  const goodsCost = useMemo(() => {
    const amount = Number(unitPrice) * quantity;
    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  }, [quantity, unitPrice]);
  const currentTransportTotal = useMemo(() => {
    if (!isPrimaryCountry) return safeAmount(shippingCost);
    try {
      return sumCostAmounts([
        safeAmount(chinaDomesticTransportCost),
        safeAmount(internationalTransportCost),
        safeAmount(insuranceCost),
      ]);
    } catch {
      return "0.00";
    }
  }, [chinaDomesticTransportCost, insuranceCost, internationalTransportCost, isPrimaryCountry, shippingCost]);
  const euroDisplays = latestCalculation && profit ? {
    supplierPrice: getSafeEuroDisplay(latestCalculation.unitPrice, currency, fxSnapshot),
    goodsCost: getSafeEuroDisplay(goodsCost, currency, fxSnapshot),
    landedCostPerUnit: getSafeEuroDisplay(latestCalculation.landedCostPerUnit, currency, fxSnapshot),
    landedCostTotal: getSafeEuroDisplay(latestCalculation.landedCostTotal, currency, fxSnapshot),
    expectedProfit: getSafeEuroDisplay(profit.totalProfit, currency, fxSnapshot),
  } : null;
  const previousSellingPriceEur = values.targetSellingPrice
    ? currency === "EUR"
      ? Number(values.targetSellingPrice)
      : fxSnapshot
        ? convertToEur(values.targetSellingPrice, currency, fxSnapshot)
        : null
    : null;
  const sellingPriceDefault = previousSellingPriceEur === null || !Number.isFinite(previousSellingPriceEur)
    ? ""
    : previousSellingPriceEur.toFixed(2);
  const confirmCostsLabel = locale === "de"
    ? "Importkosten prüfen und bestätigen"
    : locale === "en"
      ? "Review and confirm import costs"
      : "Proverite i potvrdite uvozne troškove";
  const sellingPriceHelp = locale === "de"
    ? `Verkaufspreis in EUR. ImportPilot rechnet ihn intern in ${currency} um, damit alle Kosten in derselben Währung berechnet werden.`
    : locale === "en"
      ? `Selling price in EUR. ImportPilot converts it internally to ${currency} so every cost is calculated in one currency.`
      : `Prodajnu cenu unosite u EUR. ImportPilot je interno pretvara u ${currency}, tako da se svi troškovi računaju u istoj valuti.`;
  const fxUnavailableError = locale === "de"
    ? `Für ${currency} ist kein frischer ECB-Referenzkurs verfügbar. Die Kalkulation wird nicht gespeichert.`
    : locale === "en"
      ? `No fresh ECB reference rate is available for ${currency}. The calculation will not be saved.`
      : `Za ${currency} nema svežeg ECB referentnog kursa. Računica neće biti sačuvana.`;
  const fxLoadingText = locale === "de"
    ? "Aktueller ECB-Kurs wird geladen..."
    : locale === "en"
      ? "Loading the latest ECB reference rate..."
      : "Učitavam najnoviji ECB referentni kurs...";

  useEffect(() => {
    if (currency === "EUR") return;

    const controller = new AbortController();
    void fetch("/api/fx/latest", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isFxSnapshotPayload(payload)) throw new Error("FX_UNAVAILABLE");
        const rate = payload.ratesToEur[currency.toUpperCase()];
        if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX_CURRENCY_UNAVAILABLE");
        setFxSnapshot(payload);
        setFxStatus("ready");
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        setFxSnapshot(null);
        setFxStatus("error");
        if (process.env.NODE_ENV === "development") console.warn(fetchError);
      });
    return () => controller.abort();
  }, [currency]);

  useEffect(() => {
    if (!editInitially) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editInitially]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, FormDataEntryValue | boolean> = Object.fromEntries(form.entries());
    const sellingPriceEur = Number(form.get("targetSellingPriceEur"));
    const sellingPriceInOfferCurrency = currency === "EUR"
      ? sellingPriceEur
      : fxSnapshot
        ? convertFromEur(sellingPriceEur, currency, fxSnapshot)
        : null;
    if (
      fxStatus !== "ready" ||
      !Number.isFinite(sellingPriceEur) ||
      sellingPriceEur <= 0 ||
      sellingPriceInOfferCurrency === null ||
      sellingPriceInOfferCurrency <= 0
    ) {
      setError(fxUnavailableError);
      setPending(false);
      return;
    }
    body.targetSellingPrice = sellingPriceInOfferCurrency.toFixed(2);
    delete body.targetSellingPriceEur;
    body.transportConfirmed = !isPrimaryCountry || form.has("transportConfirmed");
    body.customsDutyConfirmed = !isPrimaryCountry || form.has("customsDutyConfirmed");
    body.vatSource = overrideVat
      ? "MANUAL_OVERRIDE"
      : isPrimaryCountry
        ? "COUNTRY_PROFILE_DEFAULT"
        : "COUNTRY_DEFAULT";
    body.calculationStatus = form.get("needsReview") ? "NEEDS_REVIEW" : "CALCULATED";
    delete body.needsReview;

    try {
      const response = await fetch(`/api/offers/${offerId}/cost-calculations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) setError(result.error ?? "Kalkulacija nije sačuvana.");
      else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setError("Veza sa serverom nije dostupna. Pokušajte ponovo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="cost-panel" id={`offer-cost-${offerId}`} ref={panelRef}>
      <h3>{isPrimaryCountry ? copy.title : t("Kalkulator ukupne nabavne cene")}</h3>
      {editing && (
        <form className="cost-form" onSubmit={submit}>
          <label className="cost-form-wide">
            {copy.sellingPrice} (EUR)
            <input
              defaultValue={sellingPriceDefault}
              disabled={currency !== "EUR" && fxStatus !== "ready"}
              key={`selling-price-${fxSnapshot?.timestamp ?? fxStatus}`}
              min="0.01"
              name="targetSellingPriceEur"
              required
              step="0.01"
              type="number"
            />
          </label>
          <p className="muted-text cost-form-wide">{sellingPriceHelp}</p>
          {currency !== "EUR" && fxStatus === "loading" && (
            <p className="muted-text cost-form-wide" role="status">{fxLoadingText}</p>
          )}
          {currency !== "EUR" && fxStatus === "error" && (
            <p className="form-error cost-form-wide" role="alert">{fxUnavailableError}</p>
          )}
          {currency !== "EUR" && fxSnapshot && (
            <div className="cost-form-wide"><FxSourceNote snapshot={fxSnapshot} /></div>
          )}

          <details className="advanced-costs cost-form-wide" open={editInitially}>
            <summary>{confirmCostsLabel}</summary>
            <div className="cost-form">
              {isPrimaryCountry && (
                <div className="cost-form-wide empty-state">
                  <strong>{copy.assumptionTitle}</strong>
                  <p>{copy.assumptionText}</p>
                  <p className="warning-text">{copy.reviewWarning}</p>
                  <p><strong>{copy.goodsCost}:</strong> {goodsCost} {currency}</p>
                </div>
              )}

              <div className="cost-form-wide">
                <TransportCostAssistant
                  currency={currency}
                  fxSnapshot={fxSnapshot}
                  onApply={isPrimaryCountry ? setInternationalTransportCost : setShippingCost}
                  productName={productName}
                  quantity={quantity}
                  sourceMetadata={sourceMetadata}
                />
              </div>

              {isPrimaryCountry ? (
                <>
                  <label>{copy.chinaDomesticTransport} ({currency})
                    <input min={0} name="chinaDomesticTransportCost" onChange={(event) => setChinaDomesticTransportCost(event.target.value)} required step="0.01" type="number" value={chinaDomesticTransportCost} />
                  </label>
                  <label>{copy.internationalTransport} ({currency})
                    <input min={0} name="internationalTransportCost" onChange={(event) => setInternationalTransportCost(event.target.value)} required step="0.01" type="number" value={internationalTransportCost} />
                  </label>
                  <label>{copy.insurance} ({currency})
                    <input min={0} name="insuranceCost" onChange={(event) => setInsuranceCost(event.target.value)} required step="0.01" type="number" value={insuranceCost} />
                  </label>
                  <p className="vat-helper"><strong>{copy.transportTotal}:</strong> {currentTransportTotal} {currency}</p>
                  <label className="checkbox-label cost-form-wide">
                    <input defaultChecked={values.transportConfirmed} name="transportConfirmed" type="checkbox" />
                    {copy.transportConfirmed}
                  </label>
                </>
              ) : (
                <label>{copy.legacyTransport} ({currency})
                  <input min={0} name="shippingCost" onChange={(event) => setShippingCost(event.target.value)} required step="0.01" type="number" value={shippingCost} />
                </label>
              )}

              <label>{copy.customsDuty} (%)
                <input defaultValue={values.customsDutyRate} max={500} min={0} name="customsDutyRate" required step="0.0001" type="number" />
              </label>
              {isPrimaryCountry && (
                <label className="checkbox-label cost-form-wide">
                  <input defaultChecked={values.customsDutyConfirmed} name="customsDutyConfirmed" type="checkbox" />
                  {copy.customsConfirmed}
                </label>
              )}
              <label>{copy.vat} (%)<input aria-describedby={`vat-help-${offerId}`} readOnly type="number" value={effectiveVatRate} /></label>
              <input name="vatRate" type="hidden" value={effectiveVatRate} />
              <p className={automaticVatRate === null && !overrideVat ? "form-error vat-helper" : "vat-helper"} id={`vat-help-${offerId}`}>
                {automaticVatRate === null && !overrideVat
                  ? t("PDV nije automatski podešen jer ciljna država nije podržana.")
                  : overrideVat
                    ? t("PDV je ručno izmenjen.")
                    : isPrimaryCountry
                      ? copy.assumptionText
                      : t("PDV je automatski podešen prema ciljnoj državi.")}
              </p>
              {isPrimaryCountry && (
                <label>{copy.customsBroker} ({currency})
                  <input defaultValue={values.customsBrokerCost} min={0} name="customsBrokerCost" required step="0.01" type="number" />
                </label>
              )}

              <details
                className="advanced-costs cost-form-wide"
                open={previousVatIsOverride || values.needsReview || ["storageCost", "inspectionCost", "otherCosts"].some(
                  (key) => Number(values[key as keyof typeof values]) > 0,
                )}
              >
                <summary>{locale === "de" ? "Weitere Einstellungen" : locale === "en" ? "More settings" : "Dodatna podešavanja"}</summary>
                <div>
                  <label className="checkbox-label">
                    <input checked={overrideVat} onChange={(event) => setOverrideVat(event.target.checked)} type="checkbox" />
                    {t("Ručno izmeni PDV")}
                  </label>
                  {overrideVat && (
                    <label>{t("Ručna stopa PDV-a (%)")}
                      <input max={100} min={0} onChange={(event) => setManualVatRate(event.target.value)} required step="0.0001" type="number" value={manualVatRate} />
                    </label>
                  )}
                  <label>{copy.inspection} ({currency})<input defaultValue={values.inspectionCost} min={0} name="inspectionCost" required step="0.01" type="number" /></label>
                  <label>{copy.storage} ({currency})<input defaultValue={values.storageCost} min={0} name="storageCost" required step="0.01" type="number" /></label>
                  <label>{copy.other} ({currency})<input defaultValue={values.otherCosts} min={0} name="otherCosts" required step="0.01" type="number" /></label>
                  <label className="checkbox-label"><input defaultChecked={values.needsReview} name="needsReview" type="checkbox" /> Označi za proveru</label>
                </div>
              </details>

              {error && <p className="form-error cost-form-wide" role="alert">{error}</p>}
              <button className="cost-form-wide" disabled={pending || fxStatus !== "ready"} type="submit">{pending ? copy.calculating : copy.calculate}</button>
            </div>
          </details>
        </form>
      )}

      {showResults && latestCalculation && (
        <div className="cost-results">
          <strong>{t("Poslednja kalkulacija")} · {getStatusLabel(latestCalculation.calculationStatus, locale)}</strong>
          <span>{t("Supplier price")}: {euroDisplays?.supplierPrice.original}{euroDisplays?.supplierPrice.converted ? ` (≈ ${euroDisplays.supplierPrice.eur})` : ""}</span>
          <span>{copy.goodsCost}: {euroDisplays?.goodsCost.original}{euroDisplays?.goodsCost.converted ? ` (≈ ${euroDisplays.goodsCost.eur})` : ""}</span>
          {isPrimaryCountry && latestCostAssumptions ? (
            <>
              <span>{copy.chinaDomesticTransport}: {latestCostAssumptions.chinaDomesticTransportCost} {currency}</span>
              <span>{copy.internationalTransport}: {latestCostAssumptions.internationalTransportCost} {currency}</span>
              <span>{copy.insurance}: {latestCostAssumptions.insuranceCost} {currency}</span>
              <span>{copy.customsBroker}: {latestCostAssumptions.customsBrokerCost} {currency}</span>
            </>
          ) : (
            <span>{copy.legacyTransport}: {latestCalculation.shippingCost.toString()} {currency}</span>
          )}
          <span>{copy.customsDuty}: {latestCalculation.customsDutyAmount.toString()} {currency} ({latestCalculation.customsDutyRate.toString()}%)</span>
          <span>{copy.vat}: {latestCalculation.vatAmount.toString()} {currency} ({latestCalculation.vatRate.toString()}%)</span>
          <span>{copy.inspection}: {latestCalculation.inspectionCost.toString()} {currency}</span>
          <span>{copy.storage}: {latestCalculation.storageCost.toString()} {currency}</span>
          <span>{copy.other}: {latestCostAssumptions?.otherCosts ?? latestCalculation.otherCosts.toString()} {currency}</span>
          <span>{t("Ukupna nabavna cena")}: {euroDisplays?.landedCostTotal.original}{euroDisplays?.landedCostTotal.converted ? ` (≈ ${euroDisplays.landedCostTotal.eur})` : ""}</span>
          <span>{t("Ukupna nabavna cena po jedinici")}: {euroDisplays?.landedCostPerUnit.original}{euroDisplays?.landedCostPerUnit.converted ? ` (≈ ${euroDisplays.landedCostPerUnit.eur})` : ""}</span>
          <span>{t("Bruto marža")}: {formatDisplayedPercent(latestCalculation.grossMarginPercent)}%</span>
          <span>{t("Zarada po komadu")} ({currency}): {profit?.profitPerUnit}</span>
          <span>{t("Ukupna očekivana zarada")}: {euroDisplays?.expectedProfit.original}{euroDisplays?.expectedProfit.converted ? ` (≈ ${euroDisplays.expectedProfit.eur})` : ""}</span>
          <span>{t("Cena pokrića troškova")}: {latestCalculation.breakEvenPrice.toString()} {currency}</span>
          {currency !== "EUR" && fxSnapshot && <FxSourceNote snapshot={fxSnapshot} />}
          {!editing && (
            <button
              className="secondary-button"
              onClick={() => {
                setEditing(true);
                requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
              }}
              type="button"
            >
              {t("Izmeni vrednosti za kalkulaciju")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}