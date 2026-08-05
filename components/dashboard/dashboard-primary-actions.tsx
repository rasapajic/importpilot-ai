"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/modules/i18n/translations";
import {
  isProductImageMimeType,
  MAX_PRODUCT_IMAGE_SIZE,
} from "@/modules/projects/domain/product-image";

import styles from "./dashboard-primary-actions.module.css";

type IntakeCopy = {
  descriptionLabel: string;
  descriptionPlaceholder: string;
  addImage: string;
  changeImage: string;
  removeImage: string;
  pasteLink: string;
  linkLabel: string;
  linkPlaceholder: string;
  imageReady: string;
  imageOnlyNote: string;
  continue: string;
  detailsTitle: string;
  detailsText: string;
  importCountry: string;
  quantity: string;
  margin: string;
  back: string;
  create: string;
  creating: string;
  missingProduct: string;
  chooseImageOrLink: string;
  invalidImage: string;
  imageTooLarge: string;
  createFailed: string;
  imageUploadFailed: string;
  imageProjectName: string;
};

const copy: Record<Locale, IntakeCopy> = {
  sr: {
    descriptionLabel: "Opišite proizvod",
    descriptionPlaceholder: "Na primer: sklopivi organizator za gepek sa tri pregrade, crni poliester",
    addImage: "Dodajte sliku",
    changeImage: "Promenite sliku",
    removeImage: "Uklonite sliku",
    pasteLink: "Nalepite link",
    linkLabel: "Link proizvoda",
    linkPlaceholder: "https://...",
    imageReady: "Slika je spremna za novu pretragu.",
    imageOnlyNote: "Možete nastaviti samo sa slikom. TAJA analiza i potvrda karakteristika biće dodate u sledećoj fazi.",
    continue: "Nastavite",
    detailsTitle: "Još samo osnovni podaci",
    detailsText: "ImportPilot će ove podatke koristiti za pronalaženje ponuda i računicu.",
    importCountry: "Zemlja uvoza",
    quantity: "Količina",
    margin: "Željena marža (%)",
    back: "Nazad",
    create: "Kreirajte pretragu",
    creating: "Kreiranje...",
    missingProduct: "Opišite proizvod, dodajte sliku ili nalepite link.",
    chooseImageOrLink: "Za sada koristite sliku ili link, ne oba istovremeno.",
    invalidImage: "Dodajte JPG, PNG ili WebP sliku.",
    imageTooLarge: "Slika može imati najviše 25 MB.",
    createFailed: "Pretraga nije kreirana. Pokušajte ponovo.",
    imageUploadFailed: "Pretraga je kreirana, ali slika nije sačuvana. Možete je ponovo dodati u proizvodu.",
    imageProjectName: "Proizvod sa slike",
  },
  de: {
    descriptionLabel: "Produkt beschreiben",
    descriptionPlaceholder: "Zum Beispiel: faltbarer Kofferraum-Organizer mit drei Fächern, schwarzes Polyester",
    addImage: "Bild hinzufügen",
    changeImage: "Bild ändern",
    removeImage: "Bild entfernen",
    pasteLink: "Link einfügen",
    linkLabel: "Produktlink",
    linkPlaceholder: "https://...",
    imageReady: "Das Bild ist für die neue Suche bereit.",
    imageOnlyNote: "Sie können nur mit einem Bild fortfahren. TAJA-Bildanalyse und Merkmalsbestätigung folgen in der nächsten Phase.",
    continue: "Weiter",
    detailsTitle: "Nur noch die Grunddaten",
    detailsText: "ImportPilot verwendet diese Daten für die Angebotssuche und Kalkulation.",
    importCountry: "Einfuhrland",
    quantity: "Menge",
    margin: "Gewünschte Marge (%)",
    back: "Zurück",
    create: "Suche erstellen",
    creating: "Suche wird erstellt...",
    missingProduct: "Beschreiben Sie das Produkt, fügen Sie ein Bild hinzu oder fügen Sie einen Link ein.",
    chooseImageOrLink: "Verwenden Sie vorerst entweder ein Bild oder einen Link, nicht beides gleichzeitig.",
    invalidImage: "Bitte ein JPG-, PNG- oder WebP-Bild hinzufügen.",
    imageTooLarge: "Das Bild darf höchstens 25 MB groß sein.",
    createFailed: "Die Suche wurde nicht erstellt. Bitte versuchen Sie es erneut.",
    imageUploadFailed: "Die Suche wurde erstellt, aber das Bild wurde nicht gespeichert. Sie können es im Produkt erneut hinzufügen.",
    imageProjectName: "Produkt aus Bild",
  },
  en: {
    descriptionLabel: "Describe the product",
    descriptionPlaceholder: "For example: foldable car trunk organizer with three compartments, black polyester",
    addImage: "Add image",
    changeImage: "Change image",
    removeImage: "Remove image",
    pasteLink: "Paste link",
    linkLabel: "Product link",
    linkPlaceholder: "https://...",
    imageReady: "The image is ready for the new search.",
    imageOnlyNote: "You can continue with an image only. TAJA image analysis and attribute confirmation will be added in the next phase.",
    continue: "Continue",
    detailsTitle: "Just the basic details",
    detailsText: "ImportPilot will use these details for offer search and calculation.",
    importCountry: "Import country",
    quantity: "Quantity",
    margin: "Desired margin (%)",
    back: "Back",
    create: "Create search",
    creating: "Creating...",
    missingProduct: "Describe the product, add an image, or paste a link.",
    chooseImageOrLink: "For now, use either an image or a link, not both at the same time.",
    invalidImage: "Add a JPG, PNG, or WebP image.",
    imageTooLarge: "The image can be no larger than 25 MB.",
    createFailed: "The search was not created. Please try again.",
    imageUploadFailed: "The search was created, but the image was not saved. You can add it again inside the product.",
    imageProjectName: "Product from image",
  },
};

type ProductImageUploadMetadata = {
  projectId: string;
  documentType: "PRODUCT_IMAGE";
  linkedOfferId: null;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
};

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallback;
}

async function uploadProductImage(file: File, projectId: string, fallbackError: string) {
  const metadata: ProductImageUploadMetadata = {
    projectId,
    documentType: "PRODUCT_IMAGE",
    linkedOfferId: null,
    originalFilename: file.name,
    mimeType: file.type,
    size: file.size,
    checksum: await sha256(file),
  };

  const initiateResponse = await fetch("/api/uploads/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const initiation = (await initiateResponse.json().catch(() => null)) as {
    uploadUrl?: string;
    storageKey?: string;
    requiredHeaders?: Record<string, string>;
    error?: string;
  } | null;
  if (!initiateResponse.ok || !initiation?.uploadUrl || !initiation.storageKey) {
    throw new Error(initiation?.error ?? fallbackError);
  }

  let directUploadSucceeded = false;
  try {
    const storageResponse = await fetch(initiation.uploadUrl, {
      method: "PUT",
      headers: initiation.requiredHeaders,
      body: file,
    });
    directUploadSucceeded = storageResponse.ok;
  } catch {
    directUploadSucceeded = false;
  }

  if (!directUploadSucceeded) {
    const formData = new FormData();
    formData.set("metadata", JSON.stringify({ ...metadata, storageKey: initiation.storageKey }));
    formData.set("file", file);
    const fallbackResponse = await fetch("/api/uploads/product-image-fallback", {
      method: "POST",
      body: formData,
    });
    if (!fallbackResponse.ok) {
      throw new Error(await readError(fallbackResponse, fallbackError));
    }
    return;
  }

  const completeResponse = await fetch("/api/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...metadata, storageKey: initiation.storageKey }),
  });
  if (!completeResponse.ok) {
    throw new Error(await readError(completeResponse, fallbackError));
  }
}

function projectNameFromImage(file: File | null, fallback: string) {
  if (!file) return fallback;
  const baseName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return baseName.length >= 2 ? baseName.slice(0, 160) : fallback;
}

export function DashboardPrimaryActions() {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"product" | "details">("product");
  const [description, setDescription] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [productUrl, setProductUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!isProductImageMimeType(file.type)) {
      setError(text.invalidImage);
      return;
    }
    if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_SIZE) {
      setError(text.imageTooLarge);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

  function removeImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImage(null);
    setPreviewUrl("");
  }

  function continueFromProduct() {
    const cleanDescription = description.trim();
    const cleanUrl = productUrl.trim();
    if (!cleanDescription && !cleanUrl && !image) {
      setError(text.missingProduct);
      return;
    }
    if (cleanUrl && image) {
      setError(text.chooseImageOrLink);
      return;
    }
    if (cleanUrl) {
      const params = new URLSearchParams({ mode: "url", productUrl: cleanUrl });
      if (cleanDescription) params.set("description", cleanDescription);
      router.push(`/projects/new?${params.toString()}`);
      return;
    }
    setError("");
    setStep("details");
  }

  async function createSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const projectName = description.trim() || projectNameFromImage(image, text.imageProjectName);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          targetCountry: form.get("targetCountry"),
          quantity: form.get("quantity"),
          targetMargin: form.get("targetMargin"),
        }),
      });
      const project = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok || !project?.id) {
        throw new Error(project?.error ?? text.createFailed);
      }

      let imageUploadFailed = false;
      if (image) {
        try {
          await uploadProductImage(image, project.id, text.imageUploadFailed);
        } catch {
          imageUploadFailed = true;
        }
      }

      router.push(`/projects/${project.id}${imageUploadFailed ? "?productImageError=1" : ""}`);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : text.createFailed);
      setPending(false);
    }
  }

  return (
    <section className={styles.card} aria-busy={pending}>
      {step === "product" ? (
        <>
          <label className={styles.mainLabel}>
            {text.descriptionLabel}
            <textarea
              className={styles.description}
              maxLength={160}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={text.descriptionPlaceholder}
              value={description}
            />
          </label>

          <div className={styles.secondaryInputs}>
            <button
              className={styles.secondaryAction}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <span aria-hidden="true">▣</span>
              {image ? text.changeImage : text.addImage}
            </button>
            <button
              aria-expanded={showLink}
              className={styles.secondaryAction}
              onClick={() => setShowLink((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">↗</span>
              {text.pasteLink}
            </button>
          </div>

          <input
            accept="image/jpeg,image/png,image/webp"
            className={styles.hiddenInput}
            onChange={selectImage}
            ref={fileInputRef}
            type="file"
          />

          {showLink && (
            <label className={`${styles.fieldLabel} ${styles.linkPanel}`}>
              {text.linkLabel}
              <input
                className={styles.linkInput}
                onChange={(event) => setProductUrl(event.target.value)}
                placeholder={text.linkPlaceholder}
                type="url"
                value={productUrl}
              />
            </label>
          )}

          {image && (
            <div className={styles.imagePanel}>
              <div className={styles.imagePreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={previewUrl} />
              </div>
              <div className={styles.imageDetails}>
                <strong>{image.name}</strong>
                <small>{Math.ceil(image.size / 1024)} KB</small>
                <p className={styles.muted}>{text.imageReady}</p>
                {!description.trim() && <p className={styles.muted}>{text.imageOnlyNote}</p>}
                <div className={styles.imageActions}>
                  <button
                    className={styles.secondaryAction}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    {text.changeImage}
                  </button>
                  <button className={styles.backAction} onClick={removeImage} type="button">
                    {text.removeImage}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.footerActions}>
            <span />
            <button className={styles.primaryAction} onClick={continueFromProduct} type="button">
              {text.continue}
            </button>
          </div>
        </>
      ) : (
        <form className={styles.businessPanel} onSubmit={createSearch}>
          <header className={styles.businessHeader}>
            <h2>{text.detailsTitle}</h2>
            <p className={styles.stepText}>{text.detailsText}</p>
          </header>
          <div className={styles.businessGrid}>
            <label className={styles.fieldLabel}>
              {text.importCountry}
              <select defaultValue="RS" name="targetCountry" required>
                <option value="RS">Srbija</option>
                <option value="AT">Austrija</option>
                <option value="DE">Nemačka</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              {text.quantity}
              <input defaultValue="100" min="1" name="quantity" required step="1" type="number" />
            </label>
            <label className={styles.fieldLabel}>
              {text.margin}
              <input defaultValue="25" max="100" min="0" name="targetMargin" required step="0.01" type="number" />
            </label>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.footerActions}>
            <button
              className={styles.backAction}
              disabled={pending}
              onClick={() => setStep("product")}
              type="button"
            >
              {text.back}
            </button>
            <button className={styles.primaryAction} disabled={pending} type="submit">
              {pending ? text.creating : text.create}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
