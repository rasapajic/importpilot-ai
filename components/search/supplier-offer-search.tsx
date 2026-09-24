"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { RfqRequestPanel } from "@/components/search/rfq-request-panel";
import { UrlImportReview } from "@/components/search/url-import-review";
import { hasSupplierSearchResultCards } from "@/components/search/search-result-display";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import {
  canShowBestChoice,
  classifyOffer,
  findMatchingQuantityTier,
  type OfferClassification,
} from "@/modules/product-search/domain/offer-classification";

type ProviderStatus = "connected" | "not_configured" | "error";
type ResultOrigin = "live" | "cache";

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
  const [results, setResults] = useState<SupplierOfferSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [imported, setImported] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [reviewingUrl, setReviewingUrl] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(openUrlImport);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin | null>(null);
  const automaticSearchStarted = useRef(false);

  async function runSearch() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          quantity: Number(searchQuantity),
          targetCountry: searchCountry,
        }),
      });
      const payload = (await response.json()) as {
        results?: SupplierOfferSearchResult[];
        error?: string;
        providerStatus?: ProviderStatus;
        reason?: string;
        resultOrigin?: ResultOrigin | null;
      };
      if (!response.ok) throw new Error(payload.error);
      setProviderStatus(payload.providerStatus ?? null);
      setResultOrigin(payload.resultOrigin ?? null);
      setResults(payload.results ?? []);
    } catch (searchError) {
      setError(searchError instanceof Error && searchError.message
        ? searchError.message
        : t("Pretraga trenutno nije dostupna. Pokušajte ponovo."));
      setProviderStatus("error");
      setResults([]);
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

  function classificationFor(result: SupplierOfferSearchResult): OfferClassification {
    return classifyOffer({
      source: result.source,
      targetCountry: searchCountry,
      supplierCountry: result.supplierCountry,
      sellerCountry: result.sellerCountry,
      originCountry: result.originCountry,
      importerName: result.importerName,
      currency: result.currency,
      offerType: result.offerType,
      availabilityConfirmed: result.availabilityConfirmed,
      b2bPriceConfirmed: result.b2bPriceConfirmed,
      priceIncludesVat: result.priceIncludesVat,
    });
  }

  function groupedResults() {
    const groups = {
      domestic: [] as Array<{ result: SupplierOfferSearchResult; index: number; classification: OfferClassification }>,
      direct: [] as Array<{ result: SupplierOfferSearchResult; index: number; classification: OfferClassification }>,
      unknown: [] as Array<{ result: SupplierOfferSearchResult; index: number; classification: OfferClassification }>,
    };
    results?.forEach((result, index) => {
      const classification = classificationFor(result);
      const item = { result, index, classification };
      if (classification.kind === "DOMESTIC") groups.domestic.push(item);
      else if (classification.kind === "DIRECT_IMPORT") groups.direct.push(item);
      else groups.unknown.push(item);
    });
    return groups;
  }

  return (
    <section className="dashboard-card supplier-search">
      <header className="section-header">
        <div>
          <h2>{t("Pretraga ponuda")}</h2>
          <p>{t("Pronađite ponude dobavljača i dodajte odabrane rezultate u projekat.")}</p>
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
          {loading ? t("Pretraga...") : t("Pretraži ponude")}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
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
          {([
            [t("Domaće ponude"), groupedResults().domestic],
            [t("Direktan uvoz"), groupedResults().direct],
            [t("Vrsta ponude nije potvrđena"), groupedResults().unknown],
          ] as const).map(([groupTitle, groupItems]) => groupItems.length > 0 && (
            <section className="search-result-group" key={groupTitle}>
              <h3>{groupTitle}</h3>
              {groupItems.map(({ result, index, classification }) => {
                const matchingTier = findMatchingQuantityTier(result.quantityTiers, Number(searchQuantity));
                const bestChoice = canShowBestChoice({
                  classification,
                  hasComparablePrice: result.price !== null && result.currency !== null,
                  hasConfirmedAvailability: result.availabilityConfirmed === true,
                });
                return (
                  <article className="search-result-card" key={`${result.source}-${result.productUrl}`}>
                    {result.imageUrl ? (
                      // Provider URLs are validated and rendered without proxying or persisting image bytes.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="search-result-image"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.replaceWith(Object.assign(document.createElement("div"), {
                            className: "search-result-image-fallback",
                            textContent: t("Slika nije preuzeta"),
                          }));
                        }}
                        src={result.imageUrl}
                      />
                    ) : <div className="search-result-image-fallback">{t("Slika nije preuzeta")}</div>}
                    <div>
                      <p className="eyebrow">{result.source}</p>
                      {resultOrigin && (
                        <span
                          className={`provider-status provider-status-${resultOrigin}`}
                          title={resultOrigin === "cache" ? t("Keširani rezultat") : t("Uživo")}
                        >
                          {resultOrigin === "live" ? t("Uživo") : t("Keširano")}
                        </span>
                      )}
                      <span className={`offer-kind-badge offer-kind-${classification.kind.toLowerCase()}`}>
                        {t(classification.label)}
                      </span>
                      <span className={bestChoice ? "best-choice-badge" : "candidate-badge"}>
                        {bestChoice ? t("Najbolji izbor") : t("Vodeći kandidat — potrebna potvrda")}
                      </span>
                      <h3>{result.title}</h3>
                      <p><strong>{result.supplierName}</strong>{result.supplierCountry ? ` · ${result.supplierCountry}` : ""}</p>
                      <p>
                        {result.price !== null ? `${result.price} ${result.currency}` : t("Cena nije navedena")}
                        {classification.kind === "DOMESTIC" && result.priceIncludesVat === true ? ` · ${t("Cena sa PDV-om")}` : ""}
                        {classification.kind === "DOMESTIC" && result.netPrice !== undefined && result.netPrice !== null ? ` · ${t("Neto cena")}: ${result.netPrice} ${result.currency}` : ""}
                        {" · "}
                        {result.minimumOrderQuantity !== null
                          ? `${t("Minimalna količina (MOQ)")}: ${result.minimumOrderQuantity}`
                          : t("Minimalna količina (MOQ) nije navedena")}
                        {result.incoterm ? ` · ${result.incoterm}` : ""}
                      </p>
                      <p className="muted-text">{t(classification.reason)}</p>
                      {classification.needsSupplierConfirmation && <p className="warning-text">{t("Potrebna potvrda dobavljača")}</p>}
                      {classification.kind === "DOMESTIC" && classification.directImportCostsForBuyer === false && (
                        <p className="muted-text">{t("Troškovi direktnog uvoza za kupca: nema")}</p>
                      )}
                      {result.quantityTiers && result.quantityTiers.length > 0 ? (
                        <div className="quantity-tier-list" aria-label={t("Cene po količini")}>
                          {result.quantityTiers.map((tier) => {
                            const active = matchingTier === tier;
                            const range = tier.maxQuantity === null
                              ? `${tier.minQuantity}+ ${t("kom")}`
                              : `${tier.minQuantity}–${tier.maxQuantity} ${t("kom")}`;
                            return (
                              <div className={active ? "quantity-tier quantity-tier-active" : "quantity-tier"} key={`${tier.minQuantity}-${tier.maxQuantity ?? "plus"}`}>
                                <span>{range}{active ? ` — ${t("Vaša količina")}` : ""}</span>
                                <strong>{tier.price !== null && tier.currency ? `${tier.price} ${tier.currency}/${t("kom")}` : t("Cena nije potvrđena")}</strong>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="muted-text">{t("Količinska cena nije potvrđena.")}</p>
                      )}
                      {result.productUrl && result.productUrl !== "https://www.alibaba.com" && (
                        <a href={result.productUrl} rel="noreferrer" target="_blank">{t("Otvori ponudu dobavljača")}</a>
                      )}
                      <RfqRequestPanel
                        incoterm={result.incoterm}
                        productTitle={result.title}
                        productUrl={result.productUrl}
                        quantity={Number(searchQuantity)}
                        supplierName={result.supplierName}
                        targetCountry={searchCountry}
                      />
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
                );
              })}
            </section>
          ))}
        </div>
      )}
      </>}
    </section>
  );
}
