"use client";

import { useMemo, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { generateRfqMessage, type RfqOrderType } from "@/modules/product-search/domain/rfq";
import { getCountryDisplayName } from "@/modules/i18n/country-names";

export function RfqRequestPanel({
  productTitle,
  rfqProductName,
  supplierName,
  quantity,
  targetCountry,
  productUrl,
  incoterm,
  triggerLabel = "Zatraži konačnu ponudu",
}: {
  productTitle: string;
  rfqProductName?: string | null;
  supplierName: string;
  quantity: number;
  targetCountry: string;
  productUrl?: string | null;
  incoterm?: string | null;
  triggerLabel?: string;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<RfqOrderType>("FULL_ORDER");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState("");
  const message = useMemo(() => generateRfqMessage({
    productTitle,
    rfqProductName,
    supplierName,
    quantity,
    deliveryCountry: targetCountry,
    deliveryCity,
    postalCode,
    orderType,
    incoterm,
    productUrl,
  }), [deliveryCity, incoterm, orderType, postalCode, productTitle, productUrl, quantity, rfqProductName, supplierName, targetCountry]);

  async function copy() {
    if (!deliveryCity.trim() || !postalCode.trim()) {
      setCopied(false);
      setValidationError(t("Unesite grad i poštanski broj pre kopiranja poruke."));
      return;
    }
    setValidationError("");
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  return (
    <div className="rfq-panel">
      <button className="primary-button" onClick={() => setOpen((value) => !value)} type="button">
        {t(triggerLabel)}
      </button>
      {open && (
        <div className="rfq-box">
          <div className="rfq-grid">
            <label>{t("Količina")}<input readOnly value={quantity} /></label>
            <label>{t("Zemlja isporuke")}<input readOnly value={getCountryDisplayName(targetCountry, locale)} /></label>
            <label>{t("Grad")}<input required onChange={(event) => { setDeliveryCity(event.target.value); setCopied(false); setValidationError(""); }} value={deliveryCity} /></label>
            <label>{t("Poštanski broj")}<input required onChange={(event) => { setPostalCode(event.target.value); setCopied(false); setValidationError(""); }} value={postalCode} /></label>
            <label>{t("Tip zahteva")}
              <select onChange={(event) => { setOrderType(event.target.value as RfqOrderType); setCopied(false); }} value={orderType}>
                <option value="SAMPLE">{t("Uzorak")}</option>
                <option value="FULL_ORDER">{t("Puna narudžbina")}</option>
              </select>
            </label>
          </div>
          <textarea aria-label={t("RFQ poruka")} data-no-translate="true" readOnly rows={14} value={message} />
          {validationError && <p className="form-error" role="alert">{validationError}</p>}
          <button
            className="secondary-button"
            onClick={() => void copy()}
            title={!deliveryCity.trim() || !postalCode.trim() ? t("Unesite grad i poštanski broj pre kopiranja poruke.") : undefined}
            type="button"
          >
            {copied ? t("Poruka je kopirana") : t("Kopiraj RFQ poruku")}
          </button>
          <p className="muted-text">
            {t("Kada dobijete odgovor, unesite potvrđene podatke kroz izmenu ponude i kalkulacije.")}
          </p>
        </div>
      )}
    </div>
  );
}
