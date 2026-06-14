"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { SupplierOfferSearchResult, SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";

const emptyPreview: SupplierOfferUrlPreview = {
  title: null,
  supplierName: null,
  supplierCountry: null,
  price: null,
  currency: null,
  minimumOrderQuantity: null,
  incoterm: null,
  productUrl: "https://example.com",
  imageUrl: null,
  source: "example.com",
  isPartial: false,
  titleFromSlug: false,
};

export function UrlImportReview({
  projectId,
  onReviewChange,
  defaultOpen = false,
}: {
  projectId: string;
  onReviewChange: (reviewing: boolean) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [productUrl, setProductUrl] = useState("");
  const [preview, setPreview] = useState<SupplierOfferUrlPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!defaultOpen || preview) return;
    urlInputRef.current?.focus();
    urlInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [defaultOpen, preview]);

  async function loadPreview(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/url-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productUrl }),
      });
      const payload = (await response.json()) as { preview?: SupplierOfferUrlPreview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error);
      setPreview(payload.preview);
      onReviewChange(true);
    } catch (loadError) {
      setPreview(null);
      onReviewChange(false);
      setError(loadError instanceof Error && loadError.message ? loadError.message : t("Podaci iz linka nisu mogli biti preuzeti."));
    } finally {
      setLoading(false);
    }
  }

  function update(field: keyof SupplierOfferUrlPreview, value: string) {
    setPreview((current) => {
      const base = current ?? emptyPreview;
      if (["price", "minimumOrderQuantity"].includes(field)) {
        return { ...base, [field]: value === "" ? null : Number(value) };
      }
      return { ...base, [field]: value === "" ? null : value };
    });
  }

  function loadAnotherLink() {
    setProductUrl("");
    setPreview(null);
    setSaved(false);
    setError("");
    onReviewChange(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!preview) return;
    setSaving(true);
    setError("");
    const result: SupplierOfferSearchResult = {
      title: preview.title ?? "",
      supplierName: preview.supplierName ?? "",
      supplierCountry: preview.supplierCountry,
      price: preview.price,
      currency: preview.currency,
      minimumOrderQuantity: preview.minimumOrderQuantity,
      incoterm: preview.incoterm,
      productUrl: preview.productUrl,
      imageUrl: preview.imageUrl,
      source: preview.source,
    };
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message ? saveError.message : t("Ponuda nije dodata. Pokušajte ponovo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="url-import" open={defaultOpen || Boolean(preview)}>
      <summary>{t("Uvezi iz linka")}</summary>
      {!preview && (
        <form className="url-import-form" onSubmit={loadPreview}>
          <label>
            {t("Link proizvoda")}
            <input onChange={(event) => setProductUrl(event.target.value)} placeholder="https://..." ref={urlInputRef} required type="url" value={productUrl} />
          </label>
          <button className="secondary-button" disabled={loading} type="submit">
            {loading ? t("Preuzimanje...") : t("Preuzmi podatke")}
          </button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {preview && (
        <form className="url-review-form" onSubmit={save}>
          <p className={preview.isPartial ? "url-fallback-heading" : "url-import-success"}>
            {preview.isPartial ? t("Delimično prepoznati podaci") : `✓ ${t("Podaci preuzeti")}`}
          </p>
          <p className="warning-text">{t("Proverite podatke i potvrdite dodavanje u kupovinu.")}</p>
          <label>{t("Naziv proizvoda")}<input onChange={(event) => update("title", event.target.value)} placeholder={t("Nije prepoznato")} required value={preview.title ?? ""} /></label>
          <label>{t("Dobavljač")}<input onChange={(event) => update("supplierName", event.target.value)} placeholder={t("Nije prepoznato")} required value={preview.supplierName ?? ""} /></label>
          <label>{t("Cena")}<input min="0" onChange={(event) => update("price", event.target.value)} placeholder={t("Nije prepoznato")} step="any" type="number" value={preview.price ?? ""} /></label>
          <label>{t("Valuta")}<input maxLength={3} onChange={(event) => update("currency", event.target.value.toUpperCase())} placeholder={t("Nije prepoznato")} value={preview.currency ?? ""} /></label>
          <label>{t("Minimalna količina (MOQ)")}<input min="1" onChange={(event) => update("minimumOrderQuantity", event.target.value)} placeholder={t("Nije navedeno")} type="number" value={preview.minimumOrderQuantity ?? ""} /></label>
          <label>{t("Incoterm")}<input onChange={(event) => update("incoterm", event.target.value.toUpperCase())} placeholder={t("Nije naveden")} value={preview.incoterm ?? ""} /></label>
          <label>{t("Link slike")}<input onChange={(event) => update("imageUrl", event.target.value)} placeholder={t("Nije prepoznato")} type="url" value={preview.imageUrl ?? ""} /></label>
          <div className="url-review-actions">
            <button className="primary-button" disabled={saving || saved} type="submit">
              {saved ? t("Dodato u kupovinu") : saving ? t("Dodavanje...") : t("Potvrdi i dodaj u kupovinu")}
            </button>
            <button className="secondary-button" onClick={loadAnotherLink} type="button">{t("Učitaj drugi link")}</button>
          </div>
        </form>
      )}
    </details>
  );
}
