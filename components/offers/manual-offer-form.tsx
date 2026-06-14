"use client";

import type { SupplierOffer } from "@prisma/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
  offer?: SupplierOffer;
  onDone?: () => void;
};

export function ManualOfferForm({ projectId, offer, onDone }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(
      offer ? `/api/offers/${offer.id}` : `/api/projects/${projectId}/offers`,
      {
        method: offer ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Ponuda nije sačuvana.");
      setPending(false);
      return;
    }
    router.refresh();
    onDone?.();
    setPending(false);
  }

  return (
    <form className="offer-form" onSubmit={submit}>
      <label>Dobavljač<input defaultValue={offer?.supplierName} name="supplierName" required /></label>
      <label>Zemlja<input defaultValue={offer?.supplierCountry ?? ""} name="supplierCountry" maxLength={2} /></label>
      <label>Email<input defaultValue={offer?.contactEmail ?? ""} name="contactEmail" type="email" /></label>
      <label>Telefon<input defaultValue={offer?.contactPhone ?? ""} name="contactPhone" /></label>
      <label>MOQ<input defaultValue={offer?.moq ?? ""} name="moq" type="number" min={1} /></label>
      <label>Cena po jedinici<input defaultValue={offer?.unitPrice?.toString() ?? ""} name="unitPrice" type="number" min={0} step="0.0001" /></label>
      <label>Valuta<input defaultValue={offer?.currency ?? ""} name="currency" maxLength={3} /></label>
      <label>Incoterm<input defaultValue={offer?.incoterm ?? ""} name="incoterm" maxLength={20} /></label>
      <label>Rok isporuke, dana<input defaultValue={offer?.deliveryTimeDays ?? ""} name="deliveryTimeDays" type="number" min={0} /></label>
      <label>Uslovi plaćanja<textarea defaultValue={offer?.paymentTerms ?? ""} name="paymentTerms" /></label>
      <label>Garancija<textarea defaultValue={offer?.warranty ?? ""} name="warranty" /></label>
      <label>Verifikovan dobavljač
        <select defaultValue={offer?.supplierVerified == null ? "" : String(offer.supplierVerified)} name="supplierVerified">
          <option value="">Nepoznato</option><option value="true">Da</option><option value="false">Ne</option>
        </select>
      </label>
      <label>Godine na platformi<input defaultValue={offer?.yearsOnPlatform ?? ""} name="yearsOnPlatform" type="number" min={0} /></label>
      <label>Stopa odgovora (%)<input defaultValue={offer?.responseRatePercent?.toString() ?? ""} name="responseRatePercent" type="number" min={0} max={100} step="0.01" /></label>
      <label>Broj transakcija<input defaultValue={offer?.transactionCount ?? ""} name="transactionCount" type="number" min={0} /></label>
      <label>Broj zaposlenih<input defaultValue={offer?.employeeCount ?? ""} name="employeeCount" type="number" min={0} /></label>
      <label>Kvalitet profila (0-100)<input defaultValue={offer?.profileCompletenessScore ?? ""} name="profileCompletenessScore" type="number" min={0} max={100} /></label>
      <label>Uzorak dostupan
        <select defaultValue={offer?.sampleAvailable == null ? "" : String(offer.sampleAvailable)} name="sampleAvailable">
          <option value="">Nepoznato</option><option value="true">Da</option><option value="false">Ne</option>
        </select>
      </label>
      <label>Jasnoća uslova (0-100)<input defaultValue={offer?.termsClarityScore ?? ""} name="termsClarityScore" type="number" min={0} max={100} /></label>
      <label>Jasnoća transporta (0-100)<input defaultValue={offer?.shippingClarityScore ?? ""} name="shippingClarityScore" type="number" min={0} max={100} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={pending} type="submit">{pending ? "Čuvanje..." : "Sačuvaj ponudu"}</button>
    </form>
  );
}
