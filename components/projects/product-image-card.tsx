"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { ASSISTANT_DISPLAY_NAME } from "@/modules/assistant/brand";
import {
  isProductImageMimeType,
  MAX_PRODUCT_IMAGE_SIZE,
} from "@/modules/projects/domain/product-image";
import type { Locale } from "@/modules/i18n/translations";

import styles from "./product-image-card.module.css";

type ProductImageView = {
  id: string;
  originalFilename: string;
  mimeType: string;
  size: string;
};

type ProductImageCopy = {
  title: string;
  description: (assistantName: string) => string;
  dropTitle: string;
  dropText: string;
  addImage: string;
  takePhoto: string;
  changeImage: string;
  takeNewPhoto: string;
  deleteImage: string;
  preparing: string;
  uploading: string;
  saving: string;
  saved: string;
  deleted: string;
  invalidType: string;
  tooLarge: string;
  uploadFailed: string;
  deleteFailed: string;
  confirmDelete: string;
  readyForAnalysis: (assistantName: string) => string;
  imageAlt: string;
};

const copy: Record<Locale, ProductImageCopy> = {
  sr: {
    title: "Slika proizvoda",
    description: (assistantName) =>
      `Dodajte fotografiju ili screenshot proizvoda. ${assistantName} će je kasnije analizirati i pripremiti karakteristike za pretragu.`,
    dropTitle: "Prevucite sliku ovde",
    dropText: "JPG, PNG ili WebP, do 25 MB",
    addImage: "Dodaj sliku",
    takePhoto: "Fotografiši",
    changeImage: "Promeni sliku",
    takeNewPhoto: "Fotografiši ponovo",
    deleteImage: "Obriši sliku",
    preparing: "Priprema slike...",
    uploading: "Otpremanje u privatno skladište...",
    saving: "Provera i čuvanje slike...",
    saved: "Slika proizvoda je sačuvana.",
    deleted: "Slika proizvoda je obrisana.",
    invalidType: "Dodajte JPG, PNG ili WebP sliku.",
    tooLarge: "Slika može imati najviše 25 MB.",
    uploadFailed: "Slika nije sačuvana. Pokušajte ponovo.",
    deleteFailed: "Slika nije obrisana. Pokušajte ponovo.",
    confirmDelete: "Obrisati glavnu sliku proizvoda? Ponude i ostali dokumenti ostaju sačuvani.",
    readyForAnalysis: (assistantName) =>
      `Slika je spremna. Sledeća faza dodaje dugme „Analiziraj sliku” i ${assistantName} potvrdu karakteristika.`,
    imageAlt: "Glavna slika proizvoda",
  },
  de: {
    title: "Produktbild",
    description: (assistantName) =>
      `Fügen Sie ein Foto oder einen Screenshot des Produkts hinzu. ${assistantName} analysiert es später und bereitet Merkmale für die Suche vor.`,
    dropTitle: "Bild hierher ziehen",
    dropText: "JPG, PNG oder WebP, bis 25 MB",
    addImage: "Bild hinzufügen",
    takePhoto: "Foto aufnehmen",
    changeImage: "Bild ändern",
    takeNewPhoto: "Neues Foto aufnehmen",
    deleteImage: "Bild löschen",
    preparing: "Bild wird vorbereitet...",
    uploading: "Upload in den privaten Speicher...",
    saving: "Bild wird geprüft und gespeichert...",
    saved: "Das Produktbild wurde gespeichert.",
    deleted: "Das Produktbild wurde gelöscht.",
    invalidType: "Bitte ein JPG-, PNG- oder WebP-Bild hinzufügen.",
    tooLarge: "Das Bild darf höchstens 25 MB groß sein.",
    uploadFailed: "Das Bild wurde nicht gespeichert. Bitte erneut versuchen.",
    deleteFailed: "Das Bild wurde nicht gelöscht. Bitte erneut versuchen.",
    confirmDelete: "Das Hauptproduktbild löschen? Angebote und andere Dokumente bleiben erhalten.",
    readyForAnalysis: (assistantName) =>
      `Das Bild ist bereit. In der nächsten Phase folgen „Bild analysieren” und die Merkmalsbestätigung durch ${assistantName}.`,
    imageAlt: "Hauptproduktbild",
  },
  en: {
    title: "Product image",
    description: (assistantName) =>
      `Add a product photo or screenshot. ${assistantName} will later analyse it and prepare product attributes for search.`,
    dropTitle: "Drop an image here",
    dropText: "JPG, PNG or WebP, up to 25 MB",
    addImage: "Add image",
    takePhoto: "Take photo",
    changeImage: "Change image",
    takeNewPhoto: "Take another photo",
    deleteImage: "Delete image",
    preparing: "Preparing image...",
    uploading: "Uploading to private storage...",
    saving: "Checking and saving image...",
    saved: "The product image was saved.",
    deleted: "The product image was deleted.",
    invalidType: "Add a JPG, PNG or WebP image.",
    tooLarge: "The image can be no larger than 25 MB.",
    uploadFailed: "The image was not saved. Please try again.",
    deleteFailed: "The image was not deleted. Please try again.",
    confirmDelete: "Delete the main product image? Offers and other documents will remain saved.",
    readyForAnalysis: (assistantName) =>
      `The image is ready. The next phase adds “Analyse image” and attribute confirmation by ${assistantName}.`,
    imageAlt: "Main product image",
  },
};

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function formatSize(size: string, locale: Locale) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return "";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
}

export function ProductImageCard({
  projectId,
  productName,
  image,
}: {
  projectId: string;
  productName: string;
  image: ProductImageView | null;
}) {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  function showMessage(value: string, isError = false) {
    setMessage(value);
    setError(isError);
  }

  async function uploadFile(file: File) {
    if (!isProductImageMimeType(file.type)) {
      showMessage(text.invalidType, true);
      return;
    }
    if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_SIZE) {
      showMessage(text.tooLarge, true);
      return;
    }

    setPending(true);
    showMessage(text.preparing);
    try {
      const checksum = await sha256(file);
      const metadata = {
        projectId,
        documentType: "PRODUCT_IMAGE" as const,
        linkedOfferId: null,
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
        throw new Error(initiation.error ?? text.uploadFailed);
      }

      showMessage(text.uploading);
      const storageResponse = await fetch(initiation.uploadUrl, {
        method: "PUT",
        headers: initiation.requiredHeaders,
        body: file,
      });
      if (!storageResponse.ok) throw new Error(text.uploadFailed);

      showMessage(text.saving);
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metadata, storageKey: initiation.storageKey }),
      });
      const completed = (await completeResponse.json()) as { error?: string };
      if (!completeResponse.ok) throw new Error(completed.error ?? text.uploadFailed);

      showMessage(text.saved);
      router.refresh();
    } catch (uploadError) {
      showMessage(uploadError instanceof Error ? uploadError.message : text.uploadFailed, true);
    } finally {
      setPending(false);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadFile(file);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (pending) return;
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  }

  async function removeImage() {
    if (!image || !window.confirm(text.confirmDelete)) return;
    setPending(true);
    showMessage("");
    try {
      const response = await fetch(`/api/documents/${image.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? text.deleteFailed);
      showMessage(text.deleted);
      router.refresh();
    } catch (deleteError) {
      showMessage(deleteError instanceof Error ? deleteError.message : text.deleteFailed, true);
    } finally {
      setPending(false);
    }
  }

  const fileInputs = (
    <>
      <input
        accept="image/jpeg,image/png,image/webp"
        className={styles.hiddenInput}
        disabled={pending}
        onChange={onFileChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className={styles.hiddenInput}
        disabled={pending}
        onChange={onFileChange}
        ref={cameraInputRef}
        type="file"
      />
    </>
  );

  return (
    <section className={styles.card} aria-busy={pending}>
      <header className={styles.header}>
        <h3>{text.title}</h3>
        <p>{text.description(ASSISTANT_DISPLAY_NAME)}</p>
      </header>

      {image ? (
        <div className={styles.preview}>
          <div className={styles.imageFrame}>
            {/* The authenticated route redirects to a short-lived private S3 URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${text.imageAlt}: ${productName}`}
              src={`/api/documents/${image.id}/download`}
            />
          </div>
          <div className={styles.details}>
            <strong>{image.originalFilename}</strong>
            <p className={styles.meta}>{formatSize(image.size, locale)}</p>
            <p className={styles.analysisNote}>{text.readyForAnalysis(ASSISTANT_DISPLAY_NAME)}</p>
            <div className={styles.actions}>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {text.changeImage}
              </button>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => cameraInputRef.current?.click()}
                type="button"
              >
                {text.takeNewPhoto}
              </button>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={removeImage}
                type="button"
              >
                {text.deleteImage}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!pending) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <strong>{text.dropTitle}</strong>
            <p className={styles.hint}>{text.dropText}</p>
          </div>
          <div className={styles.actions}>
            <button
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {text.addImage}
            </button>
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => cameraInputRef.current?.click()}
              type="button"
            >
              {text.takePhoto}
            </button>
          </div>
        </>
      )}

      {fileInputs}
      {message && (
        <p className={`${styles.message} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
