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
import { buildLandedCostBreakdown } from "@/modules/cost-engine/application/landed-cost-breakdown";
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
  const sourceData = sourceMetadata && typeof sourceMetadata === "object" && !Array.isArray(sourceMetadata)
    ? sourceMetadata as Record<string, unknown>
    : {};
  const breakdown = latestCalculation ? buildLandedCostBreakdown({
    unitPrice: latestCalculation.unitPrice,
    quantity: latestCalculation.quantity,
    currency,
    shippingCost: latestCalculation.shippingCost,
    customsDutyRate: latestCalculation.customsDutyRate,
    customsDutyAmount: latestCalculation.customsDutyAmount,
    vatRate: latestCalculation.vatRate,
    vatAmount: latestCalculation.vatAmount,
    storageCost: latestCalculation.storageCost,
    inspectionCost: latestCalculation.inspectionCost,
    otherCosts: latestCalculation.otherCosts,
    landedCostTotal: latestCalculation.landedCostTotal,
    landedCostPerUnit: latestCalculation.landedCostPerUnit,
    calculationStatus: latestCalculation.calculationStatus,
    shippingEstimated: sourceData.transportEstimated === true,
    customsProvenance: sourceData.customsProvenance && typeof sourceData.customsProvenance === "object"
      ? sourceData.customsProvenance as never
      : {
          sourceName: null,
          officialUrl: null,
          checkedAt: null,
          validFrom: null,
          tariffCode: typeof sourceData.hsCode === "string" ? sourceData.hsCode : null,
          originCountry: typeof sourceData.originCountry === "string" ? sourceData.originCountry : null,
          shippingCountry: typeof sourceData.sellerCountry === "string" ? sourceData.sellerCountry : null,
          rateType: "unknown",
          confirmedByOfficialSource: false,
          classificationSuggested: typeof sourceData.hsCode === "string",
        },
  }) : null;

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
          <strong>{t("Ukupno sa cenom uvoza")} · {breakdown?.isConfirmed ? getStatusLabel(latestCalculation.calculationStatus, locale) : t("Čeka potvrđene podatke")}</strong>
          {breakdown && breakdown.pendingReasons.length > 0 && (
            <div className="calculation-warning">
              <strong>{t("Potrebna potvrda")}</strong>
              <ul>
                {breakdown.pendingReasons.map((reason) => <li key={reason}>{t(reason)}</li>)}
              </ul>
            </div>
          )}
          <span>{t("Supplier price")}: {euroDisplays?.supplierPrice.original}{euroDisplays?.supplierPrice.converted ? ` (≈ ${euroDisplays.supplierPrice.eur})` : ""}</span>
          <span>{t("Ukupna vrednost")}: {breakdown?.isConfirmed ? `${euroDisplays?.landedCostTotal.original}${euroDisplays?.landedCostTotal.converted ? ` (≈ ${euroDisplays.landedCostTotal.eur})` : ""}` : t("Čeka potvrđene podatke")}</span>
          <span>{t("Ukupno po komadu")}: {breakdown?.isConfirmed ? `${euroDisplays?.landedCostPerUnit.original}${euroDisplays?.landedCostPerUnit.converted ? ` (≈ ${euroDisplays.landedCostPerUnit.eur})` : ""}` : t("Čeka potvrđene podatke")}</span>
          <span>{t("Bruto marža")}: {formatDisplayedPercent(latestCalculation.grossMarginPercent)}%</span>
          <span>{t("Zarada po komadu")} ({currency}): {profit?.profitPerUnit}</span>
          <span>{t("Ukupna očekivana zarada")}: {euroDisplays?.expectedProfit.original}{euroDisplays?.expectedProfit.converted ? ` (≈ ${euroDisplays.expectedProfit.eur})` : ""}</span>
          <span>{t("Cena pokrića troškova")}: {latestCalculation.breakEvenPrice.toString()} {currency}</span>
          {breakdown && (
            <details className="landed-cost-breakdown" open>
              <summary>{t("Detaljan obračun")}</summary>
              <dl>
                <div><dt>{t("Cena robe")}</dt><dd>{breakdown.goodsCost.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Međunarodni transport")}</dt><dd>{breakdown.internationalShipping.toFixed(2)} {currency}{sourceData.transportEstimated === true ? ` · ${t("Procenjeni trošak")}` : ""}</dd></div>
                <div><dt>{t("Osiguranje")}</dt><dd>{breakdown.insurance === null ? t("Nije navedeno") : `${breakdown.insurance.toFixed(2)} ${currency}`}</dd></div>
                <div><dt>{t("Carinska vrednost")}</dt><dd>{breakdown.customsValue.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Tarifni/HS broj")}</dt><dd>{breakdown.customsProvenance.tariffCode ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Poreklo robe")}</dt><dd>{breakdown.customsProvenance.originCountry ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Zemlja slanja")}</dt><dd>{breakdown.customsProvenance.shippingCountry ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Carinska stopa")}</dt><dd>{breakdown.customsDutyRate.toFixed(4)}% · {breakdown.customsProvenance.confirmedByOfficialSource ? t("Potvrđeno zvaničnim izvorom") : t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Iznos carine")}</dt><dd>{breakdown.customsDutyAmount.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Osnovica za PDV")}</dt><dd>{breakdown.vatBase.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("PDV")}</dt><dd>{breakdown.vatRate.toFixed(4)}% · {breakdown.vatAmount.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Špedicija")}</dt><dd>{breakdown.freightForwarding.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Skladištenje")}</dt><dd>{breakdown.storageCost.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Ostali troškovi")}</dt><dd>{breakdown.otherCosts.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Ukupna vrednost")}</dt><dd>{breakdown.displayedTotal.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Ukupno po komadu")}</dt><dd>{breakdown.totalPerUnit.toFixed(2)} {currency}</dd></div>
              </dl>
              {breakdown.assumptions.length > 0 && (
                <p className="muted-text">{breakdown.assumptions.map((assumption) => t(assumption)).join(" ")}</p>
              )}
            </details>
          )}
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
