"use client";

import { useMemo, useState } from "react";

import { useI18n } from "@/components/i18n/i18n-provider";
import { generateRfqMessage, type RfqOrderType } from "@/modules/product-search/domain/rfq";

export function RfqRequestPanel({
  productTitle,
  supplierName,
  quantity,
  targetCountry,
  productUrl,
  incoterm,
}: {
  productTitle: string;
  supplierName: string;
  quantity: number;
  targetCountry: string;
  productUrl?: string | null;
  incoterm?: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<RfqOrderType>("FULL_ORDER");
  const [deliveryPlace, setDeliveryPlace] = useState("");
  const [copied, setCopied] = useState(false);
  const message = useMemo(() => generateRfqMessage({
    productTitle,
    supplierName,
    quantity,
    deliveryCountry: targetCountry,
    deliveryPlace,
    orderType,
    incoterm,
    productUrl,
  }), [deliveryPlace, incoterm, orderType, productTitle, productUrl, quantity, supplierName, targetCountry]);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  return (
    <div className="rfq-panel">
      <button className="primary-button" onClick={() => setOpen((value) => !value)} type="button">
        {t("Zatraži konačnu ponudu")}
      </button>
      {open && (
        <div className="rfq-box">
          <div className="rfq-grid">
            <label>{t("Količina")}<input readOnly value={quantity} /></label>
            <label>{t("Zemlja isporuke")}<input readOnly value={targetCountry} /></label>
            <label>{t("Mesto isporuke")}<input onChange={(event) => setDeliveryPlace(event.target.value)} value={deliveryPlace} /></label>
            <label>{t("Tip zahteva")}
              <select onChange={(event) => setOrderType(event.target.value as RfqOrderType)} value={orderType}>
                <option value="SAMPLE">{t("Uzorak")}</option>
                <option value="FULL_ORDER">{t("Puna narudžbina")}</option>
              </select>
            </label>
          </div>
          <textarea aria-label={t("RFQ poruka")} readOnly rows={14} value={message} />
          <button className="secondary-button" onClick={() => void copy()} type="button">
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
