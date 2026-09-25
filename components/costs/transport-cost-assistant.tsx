"use client";

import { useMemo, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import {
  estimateProductLogistics,
  estimateTransportRoutes,
  extractSupplierLogisticsData,
  type ProductSizeOption,
  type ProductWeightOption,
  type TransportMode,
} from "@/modules/transport/domain/transport-estimator";
import type { ShippingEstimateEvidence } from "@/modules/cost-engine/domain/cost-evidence";

const sizeOptions: Array<{ value: ProductSizeOption; label: string }> = [
  { value: "POCKET", label: "Fits in pocket" },
  { value: "BOOK", label: "Size of a book" },
  { value: "SHOEBOX", label: "Size of a shoebox" },
  { value: "MICROWAVE", label: "Microwave sized" },
  { value: "LARGER", label: "Larger" },
];

const weightOptions: Array<{ value: ProductWeightOption; label: string }> = [
  { value: "UNDER_100G", label: "Less than 100 g" },
  { value: "G_100_500", label: "100-500 g" },
  { value: "KG_0_5_2", label: "0.5-2 kg" },
  { value: "KG_2_10", label: "2-10 kg" },
  { value: "OVER_10KG", label: "More than 10 kg" },
];

function routeLabel(mode: TransportMode) {
  if (mode === "AIR") return "Air";
  if (mode === "RAIL") return "Rail";
  return "Sea";
}

export function TransportCostAssistant({
  productName,
  quantity,
  currency,
  sourceMetadata,
  initialSelection,
  onApply,
  onClear,
}: {
  productName: string;
  quantity: number;
  currency: string;
  sourceMetadata?: unknown;
  initialSelection?: ShippingEstimateEvidence | null;
  onApply: (selection: ShippingEstimateEvidence & { estimatedCostEur: number }) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [sizeOption, setSizeOption] = useState<ProductSizeOption | "">(
    (initialSelection?.sizeOption as ProductSizeOption | null) ?? "",
  );
  const [weightOption, setWeightOption] = useState<ProductWeightOption | "">(
    (initialSelection?.weightOption as ProductWeightOption | null) ?? "",
  );
  const [selectedMode, setSelectedMode] = useState<TransportMode | null>(initialSelection?.mode ?? null);
  const supplierLogistics = useMemo(() => extractSupplierLogisticsData(sourceMetadata), [sourceMetadata]);
  const logisticsEstimate = useMemo(() => estimateProductLogistics({
    productName,
    quantity,
    sizeOption: sizeOption || null,
    weightOption: weightOption || null,
    supplierLogistics,
  }), [productName, quantity, sizeOption, supplierLogistics, weightOption]);
  const routes = useMemo(
    () => logisticsEstimate ? estimateTransportRoutes(logisticsEstimate) : [],
    [logisticsEstimate],
  );
  const selectedRoute = routes.find((route) => route.mode === selectedMode) ?? null;
  const transportStatus = !logisticsEstimate
    ? "Transport nije poznat"
    : selectedRoute
      ? "Transport procenjen"
      : "Procene transporta su dostupne";

  function applyRoute(mode: TransportMode) {
    if (!logisticsEstimate) return;
    const route = routes.find((candidate) => candidate.mode === mode);
    if (!route) return;
    setSelectedMode(mode);
    onApply({
      mode,
      confidence: route.confidence,
      estimatedCostEur: route.estimatedCostEur,
      estimatedWeightKg: logisticsEstimate.estimatedWeightKg,
      estimatedVolumeCbm: logisticsEstimate.estimatedVolumeCbm,
      sizeOption: sizeOption || null,
      weightOption: weightOption || null,
    });
  }

  return (
    <section className="transport-assistant">
      <header>
        <div>
          <h4>{t("Procena troška transporta")}</h4>
          <p>{t("Odgovorite jednostavno. ImportPilot će proceniti težinu, zapreminu i okvirni transport.")}</p>
        </div>
        <span className={`transport-confidence transport-confidence-${logisticsEstimate?.confidence.toLowerCase() ?? "low"}`}>
          {t(transportStatus)}
        </span>
      </header>

      {logisticsEstimate?.source !== "SUPPLIER" && (
        <div className="transport-simple-questions">
          <label>
            {t("How large is the product?")}
            <select onChange={(event) => { setSizeOption(event.target.value as ProductSizeOption | ""); setSelectedMode(null); onClear(); }} value={sizeOption}>
              <option value="">{t("Not sure")}</option>
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("How heavy is one item?")}
            <select onChange={(event) => { setWeightOption(event.target.value as ProductWeightOption | ""); setSelectedMode(null); onClear(); }} value={weightOption}>
              <option value="">{t("Not sure")}</option>
              {weightOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {logisticsEstimate ? (
        <div className="transport-estimate-summary">
          <span>{t("Estimated category")}: <strong>{t(logisticsEstimate.category)}</strong></span>
          <span>{t("Estimated weight")}: <strong>{logisticsEstimate.estimatedWeightKg} kg</strong></span>
          <span>{t("Estimated volume")}: <strong>{logisticsEstimate.estimatedVolumeCbm} CBM</strong></span>
        </div>
      ) : (
        <p className="warning-text">{t("Procena nije moguća bez podataka o proizvodu. Izaberite veličinu i težinu jednog komada.")}</p>
      )}

      {selectedRoute && logisticsEstimate && (
        <p className="transport-selected-estimate">
          <strong>{t(routeLabel(selectedRoute.mode))}</strong>
          {` — ${selectedRoute.estimatedCostEur} EUR — ${t("Procenjeno")} — ${t("Pouzdanost")}: ${t(selectedRoute.confidence)}`}
        </p>
      )}

      <div className="transport-route-grid">
        {routes.map((route) => (
          <article className={selectedMode === route.mode ? "transport-route-selected" : undefined} key={route.mode}>
            <strong>{t(routeLabel(route.mode))}</strong>
            <span>{route.estimatedCostEur} EUR</span>
            <small>{route.deliveryTimeDays} {t("days")}</small>
            <small>{t("Confidence")}: {t(route.confidence)}</small>
            <button
              className="secondary-button"
              onClick={() => applyRoute(route.mode)}
              type="button"
            >
              {t("Use this estimate")}
            </button>
          </article>
        ))}
      </div>

      {currency !== "EUR" && (
        <p className="warning-text">{t("Transport estimates are shown in EUR. Check the calculation currency before saving.")}</p>
      )}

      {logisticsEstimate && <details>
        <summary>{t("Prikaži detalje")}</summary>
        <ul>
          {logisticsEstimate.reasons.map((reason) => <li key={reason}>{t(reason)}</li>)}
        </ul>
      </details>}
    </section>
  );
}
