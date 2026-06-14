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
  onApply,
}: {
  productName: string;
  quantity: number;
  currency: string;
  sourceMetadata?: unknown;
  onApply: (value: string) => void;
}) {
  const { t } = useI18n();
  const [sizeOption, setSizeOption] = useState<ProductSizeOption | "">("");
  const [weightOption, setWeightOption] = useState<ProductWeightOption | "">("");
  const supplierLogistics = useMemo(() => extractSupplierLogisticsData(sourceMetadata), [sourceMetadata]);
  const logisticsEstimate = useMemo(() => estimateProductLogistics({
    productName,
    quantity,
    sizeOption: sizeOption || null,
    weightOption: weightOption || null,
    supplierLogistics,
  }), [productName, quantity, sizeOption, supplierLogistics, weightOption]);
  const routes = useMemo(() => estimateTransportRoutes(logisticsEstimate), [logisticsEstimate]);

  return (
    <section className="transport-assistant">
      <header>
        <div>
          <h4>{t("Procena troška transporta")}</h4>
          <p>{t("Odgovorite jednostavno. ImportPilot će proceniti težinu, zapreminu i okvirni transport.")}</p>
        </div>
        <span className={`transport-confidence transport-confidence-${logisticsEstimate.confidence.toLowerCase()}`}>
          {t(logisticsEstimate.confidence)}
        </span>
      </header>

      {!supplierLogistics && (
        <div className="transport-simple-questions">
          <label>
            {t("How large is the product?")}
            <select onChange={(event) => setSizeOption(event.target.value as ProductSizeOption | "")} value={sizeOption}>
              <option value="">{t("Not sure")}</option>
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("How heavy is one item?")}
            <select onChange={(event) => setWeightOption(event.target.value as ProductWeightOption | "")} value={weightOption}>
              <option value="">{t("Not sure")}</option>
              {weightOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="transport-estimate-summary">
        <span>{t("Estimated category")}: <strong>{t(logisticsEstimate.category)}</strong></span>
        <span>{t("Estimated weight")}: <strong>{logisticsEstimate.estimatedWeightKg} kg</strong></span>
        <span>{t("Estimated volume")}: <strong>{logisticsEstimate.estimatedVolumeCbm} CBM</strong></span>
      </div>

      <div className="transport-route-grid">
        {routes.map((route) => (
          <article key={route.mode}>
            <strong>{t(routeLabel(route.mode))}</strong>
            <span>{route.estimatedCostEur} EUR</span>
            <small>{route.deliveryTimeDays} {t("days")}</small>
            <small>{t("Confidence")}: {t(route.confidence)}</small>
            <button
              className="secondary-button"
              onClick={() => onApply(route.estimatedCostEur.toFixed(2))}
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

      <details>
        <summary>{t("Prikaži detalje")}</summary>
        <ul>
          {logisticsEstimate.reasons.map((reason) => <li key={reason}>{t(reason)}</li>)}
        </ul>
      </details>
    </section>
  );
}
