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
import { CostEvidenceStatuses, VatTreatments, type CostEvidenceStatus } from "@/modules/cost-engine/domain/cost-evidence";
import { getStatusLabel } from "@/modules/i18n/translations";
import { getEuroDisplay } from "@/modules/fx/euro-display";
import { FxSourceNote } from "@/components/fx/fx-source-note";
import { TransportCostAssistant } from "@/components/costs/transport-cost-assistant";

function EvidenceSelect({
  name,
  defaultValue,
  translate,
}: {
  name: string;
  defaultValue: CostEvidenceStatus;
  translate: (text: string) => string;
}) {
  return (
    <select aria-label={translate("Status stavke")} defaultValue={defaultValue} name={name}>
      <option value={CostEvidenceStatuses.CONFIRMED}>{translate("Potvrđeno")}</option>
      <option value={CostEvidenceStatuses.ESTIMATED}>{translate("Procenjeno")}</option>
      <option value={CostEvidenceStatuses.UNKNOWN}>{translate("Nepoznato")}</option>
      <option value={CostEvidenceStatuses.NOT_APPLICABLE}>{translate("Nije primenljivo")}</option>
    </select>
  );
}

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
    (automaticVatRate === null || (values.vatRate && Number(values.vatRate) !== Number(automaticVatRate))),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(!latestCalculation || editInitially);
  const [shippingCost, setShippingCost] = useState(values.shippingCost);
  const [overrideVat, setOverrideVat] = useState(previousVatIsOverride);
  const [manualVatRate, setManualVatRate] = useState(previousVatIsOverride ? values.vatRate : "");
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveVatRate = resolveVatRate(targetCountry, overrideVat ? manualVatRate : null) ?? "";
  const profit = latestCalculation?.targetSellingPrice && latestCalculation.landedCostPerUnit
    ? getDisplayedProfitSummary({
        targetSellingPrice: latestCalculation.targetSellingPrice,
        landedCostPerUnit: latestCalculation.landedCostPerUnit,
        quantity: latestCalculation.quantity,
      })
    : null;
  const euroDisplays = latestCalculation ? {
    supplierPrice: getEuroDisplay(latestCalculation.unitPrice, currency),
    landedCostPerUnit: latestCalculation.landedCostPerUnit ? getEuroDisplay(latestCalculation.landedCostPerUnit, currency) : null,
    landedCostTotal: latestCalculation.landedCostTotal ? getEuroDisplay(latestCalculation.landedCostTotal, currency) : null,
    expectedProfit: profit ? getEuroDisplay(profit.totalProfit, currency) : null,
  } : null;
  const sourceData = sourceMetadata && typeof sourceMetadata === "object" && !Array.isArray(sourceMetadata)
    ? sourceMetadata as Record<string, unknown>
    : {};
  const breakdown = latestCalculation ? buildLandedCostBreakdown({
    unitPrice: latestCalculation.unitPrice,
    quantity: latestCalculation.quantity,
    currency,
    shippingCost: latestCalculation.shippingCost,
    insuranceCost: latestCalculation.insuranceCost,
    customsDutyRate: latestCalculation.customsDutyRate,
    customsDutyAmount: latestCalculation.customsDutyAmount,
    vatRate: latestCalculation.vatRate,
    vatAmount: latestCalculation.vatAmount,
    freightForwardingCost: latestCalculation.freightForwardingCost,
    storageCost: latestCalculation.storageCost,
    inspectionCost: latestCalculation.inspectionCost,
    otherCosts: latestCalculation.otherCosts,
    knownCostTotal: latestCalculation.knownCostTotal,
    landedCostTotal: latestCalculation.landedCostTotal,
    landedCostPerUnit: latestCalculation.landedCostPerUnit,
    calculationStatus: latestCalculation.calculationStatus,
    costEvidence: latestCalculation.costEvidence,
    vatTreatment: latestCalculation.vatTreatment,
    requiredCashTotal: latestCalculation.requiredCashTotal,
    netAcquisitionCost: latestCalculation.netAcquisitionCost,
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
  const evidenceStatusLabel = (status: CostEvidenceStatus) => t(
    status === CostEvidenceStatuses.CONFIRMED
      ? "Potvrđeno"
      : status === CostEvidenceStatuses.ESTIMATED
        ? "Procenjeno"
        : status === CostEvidenceStatuses.NOT_APPLICABLE
          ? "Nije primenljivo"
          : "Nepoznato",
  );
  const lineValue = (value: number | null, status: CostEvidenceStatus, suffix = currency) =>
    `${value === null ? t(status === CostEvidenceStatuses.NOT_APPLICABLE ? "Nije primenljivo" : "Nepoznato") : `${value.toFixed(2)} ${suffix}`} · ${evidenceStatusLabel(status)}`;

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
          <label>Transport ({currency})
            <input min={0} name="shippingCost" onChange={(event) => setShippingCost(event.target.value)} placeholder={t("Nepoznato")} step="0.01" type="number" value={shippingCost} />
            <EvidenceSelect defaultValue={values.shippingStatus} name="shippingStatus" translate={t} />
          </label>
          <label>Carina (%)
            <input defaultValue={values.customsDutyRate} max={500} min={0} name="customsDutyRate" placeholder={t("Nepoznato")} step="0.0001" type="number" />
            <EvidenceSelect defaultValue={values.customsDutyStatus} name="customsDutyStatus" translate={t} />
          </label>
          <label>PDV (%)<input aria-describedby={`vat-help-${offerId}`} readOnly type="number" value={effectiveVatRate} /></label>
          <input name="vatRate" type="hidden" value={effectiveVatRate} />
          <input name="vatStatus" type="hidden" value={values.vatStatus} />
          <p className={automaticVatRate === null && !overrideVat ? "form-error vat-helper" : "vat-helper"} id={`vat-help-${offerId}`}>
            {automaticVatRate === null && !overrideVat
              ? t("PDV nije automatski podešen jer ciljna država nije podržana.")
              : overrideVat
                ? t("PDV je ručno izmenjen.")
                : t("PDV je automatski podešen prema ciljnoj državi.")}
          </p>
          <label>Prodajna cena ({currency})<input defaultValue={values.targetSellingPrice} min="0.01" name="targetSellingPrice" placeholder={t("Unesite cenu da biste videli maržu")} step="0.01" type="number" /></label>
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
              <label>{t("PDV tretman")}
                <select defaultValue={values.vatTreatment} name="vatTreatment">
                  <option value={VatTreatments.COST}>{t("Trošak")}</option>
                  <option value={VatTreatments.DEDUCTIBLE_INPUT_TAX}>{t("Potencijalno odbitni pretporez")}</option>
                  <option value={VatTreatments.UNSURE}>{t("Nisam siguran")}</option>
                </select>
              </label>
              <label>{t("Osiguranje")} ({currency})<input defaultValue={values.insuranceCost} min={0} name="insuranceCost" placeholder={t("Nepoznato")} step="0.01" type="number" /><EvidenceSelect defaultValue={values.insuranceStatus} name="insuranceStatus" translate={t} /></label>
              <label>{t("Špedicija")} ({currency})<input defaultValue={values.freightForwardingCost} min={0} name="freightForwardingCost" placeholder={t("Nepoznato")} step="0.01" type="number" /><EvidenceSelect defaultValue={values.freightForwardingStatus} name="freightForwardingStatus" translate={t} /></label>
              <label>Inspekcija ({currency})<input defaultValue={values.inspectionCost} min={0} name="inspectionCost" placeholder={t("Nepoznato")} step="0.01" type="number" /><EvidenceSelect defaultValue={values.inspectionStatus} name="inspectionStatus" translate={t} /></label>
              <label>Skladištenje ({currency})<input defaultValue={values.storageCost} min={0} name="storageCost" placeholder={t("Nepoznato")} step="0.01" type="number" /><EvidenceSelect defaultValue={values.storageStatus} name="storageStatus" translate={t} /></label>
              <label>Ostalo ({currency})<input defaultValue={values.otherCosts} min={0} name="otherCosts" placeholder={t("Nepoznato")} step="0.01" type="number" /><EvidenceSelect defaultValue={values.otherStatus} name="otherStatus" translate={t} /></label>
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
          {!breakdown?.isConfirmed && <span><strong>{t("Poznati troškovi do sada")}:</strong> {breakdown?.knownCostTotal.toFixed(2)} {currency}</span>}
          <span>{t("Ukupna vrednost")}: {breakdown?.isConfirmed && euroDisplays?.landedCostTotal ? `${euroDisplays.landedCostTotal.original}${euroDisplays.landedCostTotal.converted ? ` (≈ ${euroDisplays.landedCostTotal.eur})` : ""}` : t("Čeka potvrđene podatke")}</span>
          <span>{t("Ukupno po komadu")}: {breakdown?.isConfirmed && euroDisplays?.landedCostPerUnit ? `${euroDisplays.landedCostPerUnit.original}${euroDisplays.landedCostPerUnit.converted ? ` (≈ ${euroDisplays.landedCostPerUnit.eur})` : ""}` : t("Čeka potvrđene podatke")}</span>
          <span>{t("Potreban novac")}: {breakdown?.isConfirmed && breakdown.requiredCashTotal !== null ? `${breakdown.requiredCashTotal.toFixed(2)} ${currency}` : t("Čeka potvrđene podatke")}</span>
          <span>{t("Neto nabavna cena")}: {breakdown?.isConfirmed && breakdown.netAcquisitionCost !== null ? `${breakdown.netAcquisitionCost.toFixed(2)} ${currency}` : breakdown?.vatTreatment === VatTreatments.UNSURE ? t("Nisam siguran") : t("Čeka potvrđene podatke")}</span>
          {breakdown?.isConfirmed && latestCalculation.targetSellingPrice && latestCalculation.grossMarginPercent && profit && (
            <>
              <span>{t("Prodajna cena")}: {latestCalculation.targetSellingPrice.toString()} {currency} · {t("Unos korisnika")}</span>
              <span>{t("Bruto marža")}: {formatDisplayedPercent(latestCalculation.grossMarginPercent)}%</span>
              <span>{t("Zarada po komadu")} ({currency}): {profit.profitPerUnit}</span>
              <span>{t("Ukupna očekivana zarada")}: {euroDisplays?.expectedProfit?.original}{euroDisplays?.expectedProfit?.converted ? ` (≈ ${euroDisplays.expectedProfit.eur})` : ""}</span>
            </>
          )}
          {breakdown && (
            <details className="landed-cost-breakdown" open>
              <summary>{t("Detaljan obračun")}</summary>
              <dl>
                <div><dt>{t("Cena robe")}</dt><dd>{lineValue(breakdown.goodsCost, breakdown.lines.goods.status)}</dd></div>
                <div><dt>{t("Međunarodni transport")}</dt><dd>{lineValue(breakdown.internationalShipping, breakdown.lines.shipping.status)}</dd></div>
                <div><dt>{t("Osiguranje")}</dt><dd>{lineValue(breakdown.insurance, breakdown.lines.insurance.status)}</dd></div>
                <div><dt>{t("Carinska vrednost")}</dt><dd>{breakdown.customsValue === null ? t("Nepoznato") : `${breakdown.customsValue.toFixed(2)} ${currency}`} · {evidenceStatusLabel(breakdown.customsValueStatus)}</dd></div>
                <div><dt>{t("Tarifni/HS broj")}</dt><dd>{breakdown.customsProvenance.tariffCode ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Poreklo robe")}</dt><dd>{breakdown.customsProvenance.originCountry ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Zemlja slanja")}</dt><dd>{breakdown.customsProvenance.shippingCountry ?? t("Nije potvrđeno")}</dd></div>
                <div><dt>{t("Carinska stopa")}</dt><dd>{breakdown.customsDutyRate === null ? t("Nepoznato") : `${breakdown.customsDutyRate.toFixed(4)}%`} · {evidenceStatusLabel(breakdown.lines.customsDuty.status)}</dd></div>
                <div><dt>{t("Iznos carine")}</dt><dd>{lineValue(breakdown.customsDutyAmount, breakdown.lines.customsDuty.status)}</dd></div>
                <div><dt>{t("Osnovica za PDV")}</dt><dd>{breakdown.vatBase === null ? t("Nepoznato") : `${breakdown.vatBase.toFixed(2)} ${currency}`} · {evidenceStatusLabel(breakdown.vatBaseStatus)}</dd></div>
                <div><dt>{t("PDV")}</dt><dd>{lineValue(breakdown.vatAmount, breakdown.lines.vat.status)} · {t(breakdown.vatTreatment === VatTreatments.COST ? "Trošak" : breakdown.vatTreatment === VatTreatments.DEDUCTIBLE_INPUT_TAX ? "Potencijalno odbitni pretporez" : "Nisam siguran")}</dd></div>
                <div><dt>{t("Špedicija")}</dt><dd>{lineValue(breakdown.freightForwarding, breakdown.lines.freightForwarding.status)}</dd></div>
                <div><dt>{t("Skladištenje")}</dt><dd>{lineValue(breakdown.storageCost, breakdown.lines.storage.status)}</dd></div>
                <div><dt>{t("Inspekcija")}</dt><dd>{lineValue(breakdown.inspectionCost, breakdown.lines.inspection.status)}</dd></div>
                <div><dt>{t("Ostali troškovi")}</dt><dd>{lineValue(breakdown.otherCosts, breakdown.lines.other.status)}</dd></div>
                <div><dt>{t("Izvor carinske stope")}</dt><dd>{breakdown.customsProvenance.sourceName ?? t("Nepoznato")}</dd></div>
                <div><dt>{t("Zvanični URL")}</dt><dd>{breakdown.customsProvenance.officialUrl ? <a href={breakdown.customsProvenance.officialUrl} rel="noreferrer" target="_blank">{breakdown.customsProvenance.officialUrl}</a> : t("Nepoznato")}</dd></div>
                <div><dt>{t("Datum provere")}</dt><dd>{breakdown.customsProvenance.checkedAt ?? t("Nije provereno")}</dd></div>
                <div><dt>{t("Poznati troškovi do sada")}</dt><dd>{breakdown.knownCostTotal.toFixed(2)} {currency}</dd></div>
                <div><dt>{t("Ukupna vrednost")}</dt><dd>{breakdown.isConfirmed && breakdown.displayedTotal !== null ? `${breakdown.displayedTotal.toFixed(2)} ${currency}` : t("Čeka potvrđene podatke")}</dd></div>
                <div><dt>{t("Ukupno po komadu")}</dt><dd>{breakdown.isConfirmed && breakdown.totalPerUnit !== null ? `${breakdown.totalPerUnit.toFixed(2)} ${currency}` : t("Čeka potvrđene podatke")}</dd></div>
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
