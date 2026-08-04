"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { UrlImportReview } from "@/components/search/url-import-review";
import { hasSupplierSearchResultCards } from "@/components/search/search-result-display";
import {
  isPartialLunaSearchResult,
  type LunaSearchPlan,
} from "@/modules/product-search/domain/luna-search-plan";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";

type ProviderStatus = "connected" | "not_configured" | "error";
type ResultOrigin = "live" | "cache";

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SupplierOfferSearch({
  projectId,
  productName,
  quantity,
  targetCountry,
  openUrlImport = false,
  canDeleteSearch = false,
}: {
  projectId: string;
  productName: string;
  quantity: number | null;
  targetCountry: string | null;
  openUrlImport?: boolean;
  canDeleteSearch?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState(productName);
  const hasProjectValues = quantity !== null && Boolean(targetCountry);
  const [useProjectValues, setUseProjectValues] = useState(hasProjectValues);
  const [searchQuantity, setSearchQuantity] = useState(quantity?.toString() ?? "");
  const [searchCountry, setSearchCountry] = useState(targetCountry ?? "");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [maxUnitPriceCurrency, setMaxUnitPriceCurrency] = useState("EUR");
  const [maxMoq, setMaxMoq] = useState("");
  const [targetMarginPercent, setTargetMarginPercent] = useState("");
  const [avoidComplexCompliance, setAvoidComplexCompliance] = useState(true);
  const [privateLabel, setPrivateLabel] = useState(false);
  const [results, setResults] = useState<SupplierOfferSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [imported, setImported] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [reviewingUrl, setReviewingUrl] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(openUrlImport);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin | null>(null);
  const [lunaPlan, setLunaPlan] = useState<LunaSearchPlan | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [unfilteredResultCount, setUnfilteredResultCount] = useState<number | null>(null);
  const automaticSearchStarted = useRef(false);

  async function runSearch() {
    setLoading(true);
    setError("");
    try {
      const parsedMaxUnitPrice = optionalNumber(maxUnitPrice);
      const response = await fetch(`/api/projects/${projectId}/supplier-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          quantity: Number(searchQuantity),
          targetCountry: searchCountry,
          maxUnitPrice: parsedMaxUnitPrice,
          maxUnitPriceCurrency: parsedMaxUnitPrice === undefined
            ? undefined
            : maxUnitPriceCurrency.toUpperCase(),
          maxMoq: optionalNumber(maxMoq),
          targetMarginPercent: optionalNumber(targetMarginPercent),
          avoidComplexCompliance,
          privateLabel,
        }),
      });
      const payload = (await response.json()) as {
        results?: SupplierOfferSearchResult[];
        error?: string;
        providerStatus?: ProviderStatus;
        reason?: string;
        resultOrigin?: ResultOrigin | null;
        lunaPlan?: LunaSearchPlan;
        fetchedAt?: string;
        unfilteredResultCount?: number;
      };
      if (!response.ok) throw new Error(payload.error);
      setProviderStatus(payload.providerStatus ?? null);
      setResultOrigin(payload.resultOrigin ?? null);
      setResults(payload.results ?? []);
      setLunaPlan(payload.lunaPlan ?? null);
      setFetchedAt(payload.fetchedAt ?? null);
      setUnfilteredResultCount(payload.unfilteredResultCount ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error && searchError.message
        ? searchError.message
        : t("Pretraga trenutno nije dostupna. Pokušajte ponovo."));
      setProviderStatus("error");
      setResults([]);
      setLunaPlan(null);
      setFetchedAt(null);
      setUnfilteredResultCount(null);
    } finally {
      setLoading(false);
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  useEffect(() => {
    if (
      automaticSearchStarted.current ||
      query.trim().length < 2 ||
      !searchQuantity ||
      searchCountry.length !== 2
    ) return;
    automaticSearchStarted.current = true;
    void runSearch();
    // Search once from the initial project values; later changes remain user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addResult(result: SupplierOfferSearchResult, index: number) {
    setImporting(index);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setImported((current) => [...current, index]);
      router.refresh();
    } catch (importError) {
      setError(importError instanceof Error && importError.message
        ? importError.message
        : t("Ponuda nije dodata. Pokušajte ponovo."));
    } finally {
      setImporting(null);
    }
  }

  return (
    <section className="dashboard-card supplier-search">
      <header className="section-header">
        <div>
          <h2>Luna Search</h2>
          <p>{t("Luna priprema upite, pronalazi ponude i prosleđuje ih u postojeću računicu uvoza.")}</p>
        </div>
        {providerStatus && (
          <span className={`provider-status provider-status-${providerStatus}`}>
            {providerStatus === "connected"
              ? t("Provider povezan")
              : providerStatus === "not_configured"
                ? t("Provider nije podešen")
                : t("Greška providera")}
          </span>
        )}
      </header>
      <UrlImportReview defaultOpen={urlImportOpen} onReviewChange={setReviewingUrl} projectId={projectId} />
      {!reviewingUrl && <>
      <p className="muted-text">
        {t("Količina i ciljna zemlja mogu se preuzeti iz projekta ili uneti ručno radi poređenja.")}
      </p>
      <label className="project-values-toggle">
        <input
          checked={useProjectValues}
          disabled={!hasProjectValues}
          onChange={(event) => {
            const checked = event.target.checked;
            setUseProjectValues(checked);
            if (checked) {
              setSearchQuantity(quantity?.toString() ?? "");
              setSearchCountry(targetCountry ?? "");
            }
          }}
          type="checkbox"
        />
        {t("Koristi vrednosti iz projekta")}
      </label>
      <details>
        <summary>{t("Luna kriterijumi")}</summary>
        <div className="supplier-search-form">
          <label>
            {t("Maksimalna cena po komadu")}
            <input
              min="0.01"
              onChange={(event) => setMaxUnitPrice(event.target.value)}
              step="0.01"
              type="number"
              value={maxUnitPrice}
            />
          </label>
          <label>
            {t("Valuta")}
            <input
              maxLength={3}
              onChange={(event) => setMaxUnitPriceCurrency(event.target.value.toUpperCase())}
              pattern="[A-Za-z]{3}"
              value={maxUnitPriceCurrency}
            />
          </label>
          <label>
            {t("Maksimalni MOQ")}
            <input
              min="1"
              onChange={(event) => setMaxMoq(event.target.value)}
              type="number"
              value={maxMoq}
            />
          </label>
          <label>
            {t("Ciljna marža (%)")}
            <input
              max="100"
              min="0"
              onChange={(event) => setTargetMarginPercent(event.target.value)}
              step="0.1"
              type="number"
              value={targetMarginPercent}
            />
          </label>
        </div>
        <label className="project-values-toggle">
          <input
            checked={avoidComplexCompliance}
            onChange={(event) => setAvoidComplexCompliance(event.target.checked)}
            type="checkbox"
          />
          {t("Izbegavaj proizvode sa komplikovanom sertifikacijom")}
        </label>
        <label className="project-values-toggle">
          <input
            checked={privateLabel}
            onChange={(event) => setPrivateLabel(event.target.checked)}
            type="checkbox"
          />
          {t("Traži OEM / sopstveni brend")}
        </label>
      </details>
      <form className="supplier-search-form" onSubmit={search}>
        <label>
          {t("Proizvod")}
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Unesite naziv proizvoda")}
            required
            minLength={2}
            value={query}
          />
        </label>
        <label>
          {t("Količina")}
          <input
            min="1"
            onChange={(event) => {
              setSearchQuantity(event.target.value);
              setUseProjectValues(false);
            }}
            required
            type="number"
            value={searchQuantity}
          />
        </label>
        <label>
          {t("Ciljna zemlja")}
          <input
            maxLength={2}
            onChange={(event) => {
              setSearchCountry(event.target.value.toUpperCase());
              setUseProjectValues(false);
            }}
            pattern="[A-Za-z]{2}"
            required
            value={searchCountry}
          />
        </label>
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? t("Luna pretražuje...") : t("Pokreni Luna Search")}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {lunaPlan && (
        <div className="empty-state">
          <h3>{t("Luna je pripremila upite")}</h3>
          <p><strong>Alibaba / Made-in-China:</strong> {lunaPlan.providerQuery}</p>
          <p>
            <strong>1688:</strong>{" "}
            {lunaPlan.chinese1688Query ?? t("Kineski upit zahteva ručnu potvrdu.")}
          </p>
          {unfilteredResultCount !== null && results && unfilteredResultCount !== results.length && (
            <p>{t("Luna kriterijumi su uklonili")}: {unfilteredResultCount - results.length}</p>
          )}
          {fetchedAt && <p className="muted-text">{t("Preuzeto")}: {new Date(fetchedAt).toLocaleString()}</p>}
          {lunaPlan.warnings.map((warning) => (
            <p className="muted-text" key={warning}>{t(warning)}</p>
          ))}
        </div>
      )}
      {results === null && <p className="muted-text">{t("Unesite proizvod da biste pronašli ponude.")}</p>}
      {results?.length === 0 && (
        <div className="empty-state">
          <h3>{t("Automatska pretraga trenutno nije dostupna.")}</h3>
          <p>{t("Koristite „Uvezi iz linka” ili „Ručno dodaj ponudu”.")}</p>
          <div className="provider-error-actions">
            <button className="secondary-button" disabled={loading} onClick={() => void runSearch()} type="button">
              {t("Pokušaj ponovo")}
            </button>
            {canDeleteSearch && <DeleteEmptySearchButton projectId={projectId} />}
            <button
              className="secondary-button"
              onClick={() => {
                setUrlImportOpen(true);
                setReviewingUrl(true);
              }}
              type="button"
            >
              {t("Uvezi iz linka")}
            </button>
            <button
              className="secondary-button"
              onClick={() => window.dispatchEvent(new CustomEvent("importpilot:manual-offer"))}
              type="button"
            >
              {t("Ručno dodaj ponudu")}
            </button>
          </div>
        </div>
      )}
      {hasSupplierSearchResultCards(results) && results && (
        <div className="search-result-list">
          {results.map((result, index) => (
            <article className="search-result-card" key={`${result.source}-${result.productUrl}`}>
              {result.imageUrl && (
                // Provider URLs are validated and rendered without proxying or persisting image bytes.
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="search-result-image" loading="lazy" src={result.imageUrl} />
              )}
              <div>
                <p className="eyebrow">{result.source}</p>
                {resultOrigin && (
                  <span
                    className={`provider-status provider-status-${resultOrigin}`}
                    title={resultOrigin === "cache" ? t("Keširani rezultat") : t("Uživo")}
                  >
                    {resultOrigin === "live" ? "LIVE" : "CACHED"}
                  </span>
                )}
                {isPartialLunaSearchResult(result) && (
                  <span className="provider-status provider-status-not_configured">PARTIAL</span>
                )}
                <h3>{result.title}</h3>
                <p><strong>{result.supplierName}</strong>{result.supplierCountry ? ` · ${result.supplierCountry}` : ""}</p>
                <p>
                  {result.price !== null ? `${result.price} ${result.currency}` : t("Cena nije navedena")}
                  {" · "}
                  {result.minimumOrderQuantity !== null
                    ? `${t("Minimalna količina (MOQ)")}: ${result.minimumOrderQuantity}`
                    : t("Minimalna količina (MOQ) nije navedena")}
                  {result.incoterm ? ` · ${result.incoterm}` : ""}
                </p>
                <a href={result.productUrl} rel="noreferrer" target="_blank">{t("Otvori izvornu ponudu")}</a>
              </div>
              <button
                className="secondary-button"
                disabled={importing === index || imported.includes(index)}
                onClick={() => addResult(result, index)}
                type="button"
              >
                {imported.includes(index)
                  ? t("Dodato u projekat")
                  : importing === index
                    ? t("Dodavanje...")
                    : t("Dodaj u kupovinu")}
              </button>
            </article>
          ))}
        </div>
      )}
      </>}
    </section>
  );
}
