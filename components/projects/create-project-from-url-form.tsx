"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { SupplierOfferSearchResult, SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";

type FallbackOffer = {
  title: string;
  supplierName: string;
  price: string;
  currency: string;
  minimumOrderQuantity: string;
  incoterm: string;
  imageUrl: string;
};

const emptyFallbackOffer: FallbackOffer = {
  title: "",
  supplierName: "",
  price: "",
  currency: "",
  minimumOrderQuantity: "",
  incoterm: "",
  imageUrl: "",
};

const manualFallbackErrors = new Set([
  "Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda.",
  "Došlo je do mrežne greške. Pokušajte ponovo.",
  "Link nije odgovorio na vreme. Pokušajte ponovo.",
]);

function previewToFallbackOffer(preview?: SupplierOfferUrlPreview): FallbackOffer {
  return {
    title: preview?.title ?? "",
    supplierName: preview?.supplierName ?? "",
    price: preview?.price === null || preview?.price === undefined ? "" : String(preview.price),
    currency: preview?.currency ?? "",
    minimumOrderQuantity: preview?.minimumOrderQuantity === null || preview?.minimumOrderQuantity === undefined ? "" : String(preview.minimumOrderQuantity),
    incoterm: preview?.incoterm ?? "",
    imageUrl: preview?.imageUrl ?? "",
  };
}

export function CreateProjectFromUrlForm() {
  const { t } = useI18n();
  const router = useRouter();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [productUrl, setProductUrl] = useState("");
  const [preview, setPreview] = useState<SupplierOfferUrlPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [fallbackOffer, setFallbackOffer] = useState<FallbackOffer>(emptyFallbackOffer);
  const [fallbackTitleFromSlug, setFallbackTitleFromSlug] = useState(false);

  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  async function fetchPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingPreview(true);
    setError("");
    setShowManualFallback(false);
    setFallbackTitleFromSlug(false);
    try {
      const response = await fetch("/api/supplier-url-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productUrl }),
      });
      const payload = (await response.json()) as { preview?: SupplierOfferUrlPreview; fallbackPreview?: SupplierOfferUrlPreview; error?: string };
      if (!response.ok || !payload.preview) {
        if (payload.fallbackPreview) {
          setFallbackOffer(previewToFallbackOffer(payload.fallbackPreview));
          setFallbackTitleFromSlug(Boolean(payload.fallbackPreview.titleFromSlug));
        } else {
          setFallbackOffer(emptyFallbackOffer);
          setFallbackTitleFromSlug(false);
        }
        throw new Error(payload.error);
      }
      setPreview(payload.preview);
    } catch (previewError) {
      setPreview(null);
      const message = previewError instanceof Error && previewError.message
        ? previewError.message
        : t("Podaci iz linka nisu mogli biti preuzeti.");
      setError(message);
      setShowManualFallback(manualFallbackErrors.has(message));
    } finally {
      setLoadingPreview(false);
    }
  }

  function update(field: keyof SupplierOfferUrlPreview, value: string) {
    setPreview((current) => {
      if (!current) return current;
      if (["price", "minimumOrderQuantity"].includes(field)) {
        return { ...current, [field]: value === "" ? null : Number(value) };
      }
      return { ...current, [field]: value === "" ? null : value };
    });
  }

  function updateFallback(field: keyof FallbackOffer, value: string) {
    setFallbackOffer((current) => ({
      ...current,
      [field]: field === "currency" || field === "incoterm" ? value.toUpperCase() : value,
    }));
  }

  async function createProjectAndImportOffer(form: FormData, result: SupplierOfferSearchResult) {
    const projectName = result.title || new URL(result.productUrl).hostname;
    const projectResponse = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        quantity: form.get("quantity"),
        targetCountry: form.get("targetCountry"),
        targetMargin: form.get("targetMargin"),
      }),
    });
    const project = (await projectResponse.json()) as { id?: string; error?: string };
    if (!projectResponse.ok || !project.id) throw new Error(project.error);

    const importResponse = await fetch(`/api/projects/${project.id}/supplier-search/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    const imported = (await importResponse.json()) as { error?: string };
    if (!importResponse.ok) throw new Error(imported.error);

    router.push(`/projects/${project.id}#workflow-step-offer`);
    router.refresh();
  }

  async function createSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    setCreating(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const projectName = preview.title ?? new URL(preview.productUrl).hostname;
    try {
      const result: SupplierOfferSearchResult = {
        title: preview.title ?? projectName,
        supplierName: preview.supplierName ?? t("Nije prepoznato"),
        supplierCountry: preview.supplierCountry,
        price: preview.price,
        currency: preview.currency,
        minimumOrderQuantity: preview.minimumOrderQuantity,
        incoterm: preview.incoterm,
        productUrl: preview.productUrl,
        imageUrl: preview.imageUrl,
        source: preview.source,
      };
      await createProjectAndImportOffer(form, result);
    } catch (createError) {
      setError(createError instanceof Error && createError.message
        ? createError.message
        : t("Pretraga nije kreirana. Pokušajte ponovo."));
      setCreating(false);
    }
  }

  async function createManualFallbackSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result: SupplierOfferSearchResult = {
        title: fallbackOffer.title.trim(),
        supplierName: fallbackOffer.supplierName.trim(),
        supplierCountry: null,
        price: fallbackOffer.price === "" ? null : Number(fallbackOffer.price),
        currency: fallbackOffer.currency.trim() || null,
        minimumOrderQuantity: fallbackOffer.minimumOrderQuantity === "" ? null : Number(fallbackOffer.minimumOrderQuantity),
        incoterm: fallbackOffer.incoterm.trim() || null,
        productUrl,
        imageUrl: fallbackOffer.imageUrl.trim() || null,
        source: new URL(productUrl).hostname,
      };
      await createProjectAndImportOffer(form, result);
    } catch (createError) {
      setError(createError instanceof Error && createError.message
        ? createError.message
        : t("Pretraga nije kreirana. Pokušajte ponovo."));
      setCreating(false);
    }
  }

  return (
    <div className="url-first-flow">
      <form className="url-import-form url-first-step" onSubmit={fetchPreview}>
        <label>
          {t("Link proizvoda")}
          <input onChange={(event) => setProductUrl(event.target.value)} placeholder="https://..." ref={urlInputRef} required type="url" value={productUrl} />
        </label>
        <button className="primary-button" disabled={loadingPreview} type="submit">
          {loadingPreview ? t("Preuzimanje...") : t("Preuzmi podatke")}
        </button>
      </form>

      {error && <p className="form-error" role="alert">{t(error)}</p>}

      {showManualFallback && (
        <form className="url-review-form url-fallback-form" onSubmit={createManualFallbackSearch}>
          <p className="url-fallback-heading">{t("Nastavite ručno bez ponovnog pokretanja.")}</p>
          <p className="warning-text">{t("Link će ostati sačuvan kao izvor ponude.")}</p>
          {fallbackTitleFromSlug && <p className="warning-text">{t("Naziv proizvoda procenjen iz linka")}</p>}
          <label>{t("Naziv proizvoda")}<input onChange={(event) => updateFallback("title", event.target.value)} required value={fallbackOffer.title} /></label>
          <label>{t("Dobavljač")}<input onChange={(event) => updateFallback("supplierName", event.target.value)} required value={fallbackOffer.supplierName} /></label>
          <label>{t("Cena")}<input min="0" onChange={(event) => updateFallback("price", event.target.value)} required step="any" type="number" value={fallbackOffer.price} /></label>
          <label>{t("Valuta")}<input maxLength={3} minLength={3} onChange={(event) => updateFallback("currency", event.target.value)} placeholder="USD" required value={fallbackOffer.currency} /></label>
          <label>{t("Minimalna količina (MOQ)")}<input min="1" onChange={(event) => updateFallback("minimumOrderQuantity", event.target.value)} placeholder={t("Nije navedeno")} type="number" value={fallbackOffer.minimumOrderQuantity} /></label>
          <label>{t("Incoterm")}<input maxLength={20} onChange={(event) => updateFallback("incoterm", event.target.value)} placeholder={t("Nije naveden")} value={fallbackOffer.incoterm} /></label>
          <label>{t("Link slike")}<input onChange={(event) => updateFallback("imageUrl", event.target.value)} placeholder={t("Opcionalno")} type="url" value={fallbackOffer.imageUrl} /></label>
          <div className="url-first-project-fields">
            <label>{t("Količina")}<input min="1" name="quantity" required type="number" /></label>
            <label>{t("Ciljna zemlja")}<input maxLength={2} minLength={2} name="targetCountry" placeholder="DE" required /></label>
            <label>{t("Ciljna marža (%)")}<input max={100} min={0} name="targetMargin" required step="0.01" type="number" /></label>
          </div>
          <button className="primary-button" disabled={creating} type="submit">
            {creating ? t("Kreiranje...") : t("Nastavi ručno")}
          </button>
        </form>
      )}

      {preview && (
        <form className="url-review-form" onSubmit={createSearch}>
          <p className={preview.isPartial ? "url-fallback-heading" : "url-import-success"}>
            {preview.isPartial ? t("Delimično prepoznati podaci") : `✓ ${t("Podaci preuzeti")}`}
          </p>
          <label>{t("Naziv proizvoda")}<input onChange={(event) => update("title", event.target.value)} placeholder={t("Nije prepoznato")} required value={preview.title ?? ""} /></label>
          <label>{t("Dobavljač")}<input onChange={(event) => update("supplierName", event.target.value)} placeholder={t("Nije prepoznato")} value={preview.supplierName ?? ""} /></label>
          <label>{t("Cena")}<input min="0" onChange={(event) => update("price", event.target.value)} placeholder={t("Nije prepoznato")} step="any" type="number" value={preview.price ?? ""} /></label>
          <label>{t("Minimalna količina (MOQ)")}<input min="1" onChange={(event) => update("minimumOrderQuantity", event.target.value)} placeholder={t("Nije navedeno")} type="number" value={preview.minimumOrderQuantity ?? ""} /></label>
          <label>{t("Valuta")}<input maxLength={3} onChange={(event) => update("currency", event.target.value.toUpperCase())} placeholder={t("Nije prepoznato")} value={preview.currency ?? ""} /></label>
          <label>{t("Link slike")}<input onChange={(event) => update("imageUrl", event.target.value)} placeholder={t("Nije prepoznato")} type="url" value={preview.imageUrl ?? ""} /></label>
          <div className="url-first-project-fields">
            <label>{t("Količina")}<input min="1" name="quantity" required type="number" /></label>
            <label>{t("Ciljna zemlja")}<input maxLength={2} minLength={2} name="targetCountry" placeholder="DE" required /></label>
            <label>{t("Ciljna marža (%)")}<input max={100} min={0} name="targetMargin" required step="0.01" type="number" /></label>
          </div>
          <button className="primary-button" disabled={creating} type="submit">
            {creating ? t("Kreiranje...") : t("Kreiraj pretragu")}
          </button>
        </form>
      )}
    </div>
  );
}
