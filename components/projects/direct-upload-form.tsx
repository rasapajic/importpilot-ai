"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { getStatusLabel } from "@/modules/i18n/translations";

type DocumentType = "OFFER" | "PROFORMA" | "SHIPPING_QUOTE" | "PRODUCT_IMAGE" | "OTHER";
type OfferOption = { id: string; supplierName: string };
type VaultDocument = {
  id: string;
  originalFilename: string;
  size: string;
  documentType: DocumentType;
  linkedOffer: OfferOption | null;
};

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function DirectUploadForm({
  projectId,
  offers,
  documents,
}: {
  projectId: string;
  offers: OfferOption[];
  documents: VaultDocument[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("OFFER");
  const [linkedOfferId, setLinkedOfferId] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPending(true);
    setMessage(t("Priprema direktnog otpremanja..."));

    try {
      const checksum = await sha256(file);
      const metadata = {
        projectId,
        documentType,
        linkedOfferId: linkedOfferId || null,
        originalFilename: file.name,
        mimeType: file.type,
        size: file.size,
        checksum,
      };
      const initiateResponse = await fetch("/api/uploads/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const initiation = (await initiateResponse.json()) as {
        uploadUrl?: string;
        storageKey?: string;
        requiredHeaders?: Record<string, string>;
        error?: string;
      };
      if (!initiateResponse.ok || !initiation.uploadUrl || !initiation.storageKey) {
        throw new Error(initiation.error ?? "Upload nije iniciran.");
      }

      setMessage(t("Otpremanje u privatno skladište..."));
      const storageResponse = await fetch(initiation.uploadUrl, {
        method: "PUT",
        headers: initiation.requiredHeaders,
        body: file,
      });
      if (!storageResponse.ok) throw new Error(t("Direktno otpremanje nije uspelo."));

      setMessage(t("Provera datoteke i čuvanje dokumenta..."));
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metadata, storageKey: initiation.storageKey }),
      });
      const completed = (await completeResponse.json()) as { error?: string };
      if (!completeResponse.ok) {
        throw new Error(completed.error ?? "Upload nije potvrđen.");
      }

      setMessage(t("Dokument je dodat u uvozne dokumente."));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Došlo je do greške.");
    } finally {
      setPending(false);
      event.target.value = "";
    }
  }

  async function remove(documentId: string) {
    if (!window.confirm(t("Obrisati ovaj dokument?"))) return;
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Dokument je obrisan." : result.error ?? "Brisanje nije uspelo.");
    if (response.ok) router.refresh();
    setPending(false);
  }

  return (
    <>
      <div className="upload-panel vault-upload">
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}>
          <option value="OFFER">Ponuda</option>
          <option value="PROFORMA">Proforma faktura</option>
          <option value="SHIPPING_QUOTE">Transportna ponuda</option>
          <option value="PRODUCT_IMAGE">Slika proizvoda</option>
          <option value="OTHER">Ostalo</option>
        </select>
        <select value={linkedOfferId} onChange={(event) => setLinkedOfferId(event.target.value)}>
          <option value="">Samo projekat</option>
          {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.supplierName}</option>)}
        </select>
        <label className="upload-button">
          {pending ? t("Otpremanje je u toku...") : t("Dodaj dokument")}
          <input disabled={pending} onChange={upload} type="file" accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp" />
        </label>
        {message && <p>{message}</p>}
      </div>
      <div className="vault-list">
        {documents.map((document) => (
          <article className="vault-document" key={document.id}>
            <div>
              <strong>{document.originalFilename}</strong>
              <p>{getStatusLabel(document.documentType, locale)} · {document.linkedOffer?.supplierName ?? t("Projekat")} · {(Number(document.size) / 1024).toFixed(1)} KB</p>
            </div>
            <div className="actions">
              <a className="secondary-button" href={`/api/documents/${document.id}/download`}>Preuzmi</a>
              <button className="secondary-button" disabled={pending} onClick={() => remove(document.id)} type="button">Obriši</button>
            </div>
          </article>
        ))}
        {documents.length === 0 && <div className="empty-state"><h3>{t("Dokumenti nisu dodati")}</h3><p>{t("Dodajte ponudu, proformu, transportnu ponudu ili sliku proizvoda.")}</p></div>}
      </div>
    </>
  );
}
