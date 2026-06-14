"use client";

import type { CostCalculation } from "@prisma/client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { getCalculationFormValues } from "@/modules/cost-engine/application/calculation-form-values";
import {
  formatDisplayedPercent,
  getDisplayedProfitSummary,
} from "@/modules/cost-engine/application/calculation-summary";
import { getAutomaticVatRate, resolveVatRate } from "@/modules/cost-engine/domain/vat-rates";
import { getStatusLabel } from "@/modules/i18n/translations";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import { FxSourceNote } from "@/components/fx/fx-source-note";
import { TransportCostAssistant } from "@/components/costs/transport-cost-assistant";

export function CostCalculatorForm({
  offerId,
  currency,
  targetCountry,
  productName,
  quantity,
  sourceMetadata,
  latestCalculation,
  editInitially = false,
}: {
  offerId: string;
  currency: string;
  targetCountry: string;
  productName: string;
  quantity: number;
  sourceMetadata?: unknown;
  latestCalculation?: CostCalculation;
  editInitially?: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const values = getCalculationFormValues(latestCalculation);
  const automaticVatRate = getAutomaticVatRate(targetCountry);
  const previousVatIsOverride = Boolean(
    latestCalculation &&
    (automaticVatRate === null || Number(values.vatRate) !== Number(automaticVatRate)),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(!latestCalculation || editInitially);
  const [shippingCost, setShippingCost] = useState(values.shippingCost);
  const [overrideVat, setOverrideVat] = useState(previousVatIsOverride);
  const [manualVatRate, setManualVatRate] = useState(previousVatIsOverride ? values.vatRate : "");
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveVatRate = resolveVatRate(targetCountry, overrideVat ? manualVatRate : null) ?? "";
  const profit = latestCalculation ? getDisplayedProfitSummary(latestCalculation) : null;
  const euroDisplays = latestCalculation && profit ? {
    supplierPrice: getEuroDisplay(latestCalculation.unitPrice, currency),
    landedCostPerUnit: getEuroDisplay(latestCalculation.landedCostPerUnit, currency),
    landedCostTotal: getEuroDisplay(latestCalculation.landedCostTotal, currency),
    expectedProfit: getEuroDisplay(profit.totalProfit, currency),
  } : null;

  useEffect(() => {
    if (!editInitially) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editInitially]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
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
      <h3>{t("Kalkulator ukupne nabavne cene")}</h3>
      {editing && (
        <form className="cost-form" onSubmit={submit}>
          <div className="cost-form-wide">
            <TransportCostAssistant
              currency={currency}
              onApply={setShippingCost}
              productName={productName}
              quantity={quantity}
              sourceMetadata={sourceMetadata}
            />
          </div>
          <label>Transport ({currency})<input min={0} name="shippingCost" onChange={(event) => setShippingCost(event.target.value)} required step="0.01" type="number" value={shippingCost} /></label>
          <label>Carina (%)<input defaultValue={values.customsDutyRate} max={500} min={0} name="customsDutyRate" required step="0.0001" type="number" /></label>
          <label>PDV (%)<input aria-describedby={`vat-help-${offerId}`} readOnly type="number" value={effectiveVatRate} /></label>
          <input name="vatRate" type="hidden" value={effectiveVatRate} />
          <p className={automaticVatRate === null && !overrideVat ? "form-error vat-helper" : "vat-helper"} id={`vat-help-${offerId}`}>
            {automaticVatRate === null && !overrideVat
              ? t("PDV nije automatski podešen jer ciljna država nije podržana.")
              : overrideVat
                ? t("PDV je ručno izmenjen.")
                : t("PDV je automatski podešen prema ciljnoj državi.")}
          </p>
          <label>Prodajna cena ({currency})<input defaultValue={values.targetSellingPrice} min="0.01" name="targetSellingPrice" required step="0.01" type="number" /></label>
          <details
            className="advanced-costs"
            open={previousVatIsOverride || values.needsReview || ["storageCost", "inspectionCost", "otherCosts"].some(
              (key) => Number(values[key as keyof typeof values]) > 0,
            )}
          >
            <summary>Napredna podešavanja</summary>
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
              <label>Inspekcija ({currency})<input defaultValue={values.inspectionCost} min={0} name="inspectionCost" required step="0.01" type="number" /></label>
              <label>Skladištenje ({currency})<input defaultValue={values.storageCost} min={0} name="storageCost" required step="0.01" type="number" /></label>
              <label>Ostalo ({currency})<input defaultValue={values.otherCosts} min={0} name="otherCosts" required step="0.01" type="number" /></label>
              <label className="checkbox-label"><input defaultChecked={values.needsReview} name="needsReview" type="checkbox" /> Označi za proveru</label>
            </div>
          </details>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button disabled={pending} type="submit">{pending ? "Računanje..." : "Izračunaj i sačuvaj"}</button>
        </form>
      )}
      {latestCalculation && (
        <div className="cost-results">
          <strong>{t("Poslednja kalkulacija")} · {getStatusLabel(latestCalculation.calculationStatus, locale)}</strong>
          <span>{t("Supplier price")}: {euroDisplays?.supplierPrice.original}{euroDisplays?.supplierPrice.converted ? ` (≈ ${euroDisplays.supplierPrice.eur})` : ""}</span>
          <span>{t("Ukupna nabavna cena")}: {euroDisplays?.landedCostTotal.original}{euroDisplays?.landedCostTotal.converted ? ` (≈ ${euroDisplays.landedCostTotal.eur})` : ""}</span>
          <span>{t("Ukupna nabavna cena po jedinici")}: {euroDisplays?.landedCostPerUnit.original}{euroDisplays?.landedCostPerUnit.converted ? ` (≈ ${euroDisplays.landedCostPerUnit.eur})` : ""}</span>
          <span>{t("Bruto marža")}: {formatDisplayedPercent(latestCalculation.grossMarginPercent)}%</span>
          <span>{t("Zarada po komadu")} ({currency}): {profit?.profitPerUnit}</span>
          <span>{t("Ukupna očekivana zarada")}: {euroDisplays?.expectedProfit.original}{euroDisplays?.expectedProfit.converted ? ` (≈ ${euroDisplays.expectedProfit.eur})` : ""}</span>
          <span>{t("Cena pokrića troškova")}: {latestCalculation.breakEvenPrice.toString()} {currency}</span>
          <FxSourceNote />
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
