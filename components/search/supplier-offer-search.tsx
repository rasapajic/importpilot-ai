"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { DeleteEmptySearchButton } from "@/components/projects/delete-empty-search-button";
import { getRecoverySearchCopy } from "@/components/search/recovery-search-copy";
import { UrlImportReview } from "@/components/search/url-import-review";
import { getLunaSearchCopy } from "@/components/search/luna-search-copy";
import { hasSupplierSearchResultCards } from "@/components/search/search-result-display";
import {
  TajaRequirementMatchPanel,
  TajaSearchLoadingNotice,
} from "@/components/search/taja-search-feedback";
import {
  isPartialLunaSearchResult,
  type LunaSearchPlan,
} from "@/modules/product-search/domain/luna-search-plan";
import {
  readRecoverySearchCriteria,
  RECOVERY_SEARCH_EVENT,
  type RecoverySearchCriteria,
} from "@/modules/product-search/domain/recovery-search";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import type {
  TajaCandidateAnalysis,
  TajaMissingDataKey,
} from "@/modules/product-search/domain/taja-candidate-analysis";

type ProviderStatus = "connected" | "not_configured" | "error";
type ResultOrigin = "live" | "cache";
type SearchOverrides = {
  maxUnitPrice?: string;
  maxUnitPriceCurrency?: string;
  strictPriceLimit?: boolean;
};

const INITIAL_OTHER_RESULTS = 7;

const comparisonCopy = {
  sr: {
    add: "Dodaj za poređenje",
    added: "Dodato za poređenje",
    adding: "Dodavanje...",
    selected: (count: number) => `Odabrano za poređenje: ${count}`,
    instructions: "Dodajte sve ponude koje želite, pa tek onda nastavite.",
    continue: "Nastavi sa odabranim ponudama",
    continuing: "Otvaranje sledećeg koraka...",
  },
  de: {
    add: "Zum Vergleich hinzufügen",
    added: "Für den Vergleich hinzugefügt",
    adding: "Wird hinzugefügt...",
    selected: (count: number) => `Für den Vergleich ausgewählt: ${count}`,
    instructions: "Fügen Sie alle gewünschten Angebote hinzu und fahren Sie erst danach fort.",
    continue: "Mit ausgewählten Angeboten fortfahren",
    continuing: "Nächster Schritt wird geöffnet...",
  },
  en: {
    add: "Add for comparison",
    added: "Added for comparison",
    adding: "Adding...",
    selected: (count: number) => `Selected for comparison: ${count}`,
    instructions: "Add every offer you want to compare, then continue when your selection is complete.",
    continue: "Continue with selected offers",
    continuing: "Opening the next step...",
  },
} as const;

const recommendationCopy = {
  sr: {
    preliminaryTitle: "Tajine preliminarne preporuke",
    preliminaryDescription: "Do tri ponude su izdvojene prema trenutno dostupnoj ceni, MOQ-u i kompletnosti podataka. Konačni izbor sledi posle landed-cost obračuna i provere rizika.",
    analyzedTitle: "Tajine najbolje analizirane ponude",
    analyzedDescription: "Ponude sa potvrđenim landed cost-om i dovoljnim podacima imaju konačan status. Ostale su jasno označene kao preliminarne.",
    rankPreliminary: (rank: number) => `#${rank} preliminarna preporuka`,
    otherTitle: "Ostale pronađene ponude",
    otherDescription: (count: number) => `Taja je pronašla još ${count} upotrebljivih ponuda koje možete pregledati i dodati za poređenje.`,
    showAll: (count: number) => `Prikaži svih ${count} ostalih ponuda`,
    showLess: "Prikaži manje",
  },
  de: {
    preliminaryTitle: "Tajas vorläufige Empfehlungen",
    preliminaryDescription: "Bis zu drei Angebote werden anhand des derzeit verfügbaren Preises, der MOQ und der Datenvollständigkeit hervorgehoben. Die endgültige Auswahl folgt nach Landed-Cost- und Risikoprüfung.",
    analyzedTitle: "Tajas bestbewertete analysierte Angebote",
    analyzedDescription: "Angebote mit bestätigten Landed Costs und ausreichenden Lieferantendaten erhalten einen endgültigen Status. Alle anderen bleiben klar als vorläufig gekennzeichnet.",
    rankPreliminary: (rank: number) => `#${rank} vorläufige Empfehlung`,
    otherTitle: "Weitere gefundene Angebote",
    otherDescription: (count: number) => `Taja hat ${count} weitere brauchbare Angebote gefunden, die Sie prüfen und zum Vergleich hinzufügen können.`,
    showAll: (count: number) => `Alle ${count} weiteren Angebote anzeigen`,
    showLess: "Weniger anzeigen",
  },
  en: {
    preliminaryTitle: "Taja's preliminary recommendations",
    preliminaryDescription: "Up to three offers are highlighted using the currently available price, MOQ and data completeness. Final selection follows landed-cost and risk verification.",
    analyzedTitle: "Taja's best analyzed offers",
    analyzedDescription: "Offers with confirmed landed cost and sufficient supplier evidence receive a final status. All others remain clearly marked as preliminary.",
    rankPreliminary: (rank: number) => `#${rank} preliminary recommendation`,
    otherTitle: "Other offers found",
    otherDescription: (count: number) => `Taja found ${count} more usable offers that you can review and add for comparison.`,
    showAll: (count: number) => `Show all ${count} other offers`,
    showLess: "Show fewer",
  },
} as const;

const analysisCopy = {
  sr: {
    recommendation: {
      RECOMMENDED: "konačna preporuka",
      OK_WITH_RISK: "preporuka uz rizik",
      NEEDS_NEGOTIATION: "potrebno pregovaranje",
      NOT_RECOMMENDED: "ne preporučuje se",
    },
    risk: { LOW: "nizak", MEDIUM: "srednji", HIGH: "visok", UNKNOWN: "nepoznat" },
    landedCost: { UNAVAILABLE: "nije obračunat", ESTIMATED: "procena", CONFIRMED: "potvrđen" },
    missing: {
      LANDED_COST: "potvrđen landed cost",
      SUPPLIER_VERIFICATION: "verifikacija dobavljača",
      SUPPLIER_RISK_DATA: "dovoljno podataka o riziku",
      DELIVERY_TIME: "rok isporuke",
      SAMPLE_AVAILABILITY: "dostupnost uzorka",
      COMMERCIAL_TERMS: "komercijalni uslovi",
      TRANSPORT_DETAILS: "detalji transporta",
      CORE_OFFER_DATA: "osnovni podaci ponude",
      PRODUCT_REQUIREMENTS: "potvrda traženih osobina proizvoda",
    },
    score: "Taja rezultat",
    confidence: "Pouzdanost podataka",
    riskLabel: "Rizik dobavljača",
    landedCostLabel: "Landed cost",
    missingLabel: "Nedostaje za konačnu odluku",
    preliminary: "preliminarna analiza",
  },
  de: {
    recommendation: {
      RECOMMENDED: "endgültige Empfehlung",
      OK_WITH_RISK: "Empfehlung mit Risiko",
      NEEDS_NEGOTIATION: "Verhandlung erforderlich",
      NOT_RECOMMENDED: "nicht empfohlen",
    },
    risk: { LOW: "niedrig", MEDIUM: "mittel", HIGH: "hoch", UNKNOWN: "unbekannt" },
    landedCost: { UNAVAILABLE: "nicht berechnet", ESTIMATED: "Schätzung", CONFIRMED: "bestätigt" },
    missing: {
      LANDED_COST: "bestätigte Landed Costs",
      SUPPLIER_VERIFICATION: "Lieferantenverifizierung",
      SUPPLIER_RISK_DATA: "ausreichende Risikodaten",
      DELIVERY_TIME: "Lieferzeit",
      SAMPLE_AVAILABILITY: "Musterverfügbarkeit",
      COMMERCIAL_TERMS: "Geschäftsbedingungen",
      TRANSPORT_DETAILS: "Transportdetails",
      CORE_OFFER_DATA: "Kerndaten des Angebots",
      PRODUCT_REQUIREMENTS: "Bestätigung der gewünschten Produkteigenschaften",
    },
    score: "Taja-Bewertung",
    confidence: "Datenzuverlässigkeit",
    riskLabel: "Lieferantenrisiko",
    landedCostLabel: "Landed Cost",
    missingLabel: "Fehlt für die endgültige Entscheidung",
    preliminary: "vorläufige Analyse",
  },
  en: {
    recommendation: {
      RECOMMENDED: "final recommendation",
      OK_WITH_RISK: "recommendation with risk",
      NEEDS_NEGOTIATION: "negotiation required",
      NOT_RECOMMENDED: "not recommended",
    },
    risk: { LOW: "low", MEDIUM: "medium", HIGH: "high", UNKNOWN: "unknown" },
    landedCost: { UNAVAILABLE: "not calculated", ESTIMATED: "estimated", CONFIRMED: "confirmed" },
    missing: {
      LANDED_COST: "confirmed landed cost",
      SUPPLIER_VERIFICATION: "supplier verification",
      SUPPLIER_RISK_DATA: "sufficient risk evidence",
      DELIVERY_TIME: "delivery time",
      SAMPLE_AVAILABILITY: "sample availability",
      COMMERCIAL_TERMS: "commercial terms",
      TRANSPORT_DETAILS: "transport details",
      CORE_OFFER_DATA: "core offer data",
      PRODUCT_REQUIREMENTS: "confirmation of requested product features",
    },
    score: "Taja score",
    confidence: "Data confidence",
    riskLabel: "Supplier risk",
    landedCostLabel: "Landed cost",
    missingLabel: "Missing for a final decision",
    preliminary: "preliminary analysis",
  },
} as const;

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
  const { t, locale } = useI18n();
  const lunaCopy = getLunaSearchCopy(locale);
  const recoveryCopy = getRecoverySearchCopy(locale);
  const comparisonText = comparisonCopy[locale];
  const recommendationText = recommendationCopy[locale];
  const analysisText = analysisCopy[locale];
  const router = useRouter();
  const [query, setQuery] = useState(productName);
  const hasProjectValues = quantity !== null && Boolean(targetCountry);
  const [useProjectValues, setUseProjectValues] = useState(hasProjectValues);
  const [searchQuantity, setSearchQuantity] = useState(quantity?.toString() ?? "");
  const [searchCountry, setSearchCountry] = useState(targetCountry ?? "");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [maxUnitPriceCurrency, setMaxUnitPriceCurrency] = useState("EUR");
  const [strictPriceLimit, setStrictPriceLimit] = useState(false);
  const [recoveryCriteria, setRecoveryCriteria] = useState<RecoverySearchCriteria | null>(null);
  const [maxMoq, setMaxMoq] = useState("");
  const [targetMarginPercent, setTargetMarginPercent] = useState("");
  const [avoidComplexCompliance, setAvoidComplexCompliance] = useState(true);
  const [privateLabel, setPrivateLabel] = useState(false);
  const [results, setResults] = useState<SupplierOfferSearchResult[] | null>(null);
  const [candidateAnalyses, setCandidateAnalyses] = useState<TajaCandidateAnalysis[]>([]);
  const [showAllResults, setShowAllResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [imported, setImported] = useState<number[]>([]);
  const [isAdvancing, startAdvancing] = useTransition();
  const [error, setError] = useState("");
  const [reviewingUrl, setReviewingUrl] = useState(false);
  const [urlImportOpen, setUrlImportOpen] = useState(openUrlImport);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin | null>(null);
  const [lunaPlan, setLunaPlan] = useState<LunaSearchPlan | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [unfilteredResultCount, setUnfilteredResultCount] = useState<number | null>(null);
  const automaticSearchStarted = useRef(false);
  const criteriaDetailsRef = useRef<HTMLDetailsElement>(null);

  const clearRecoveryMode = useCallback(() => {
    setStrictPriceLimit(false);
    setRecoveryCriteria(null);
  }, []);

  const runSearch = useCallback(async (overrides: SearchOverrides = {}) => {
    setLoading(true);
    setError("");
    setImported([]);
    setCandidateAnalyses([]);
    setShowAllResults(false);
    try {
      const effectiveMaxUnitPrice = overrides.maxUnitPrice ?? maxUnitPrice;
      const effectiveMaxUnitPriceCurrency =
        overrides.maxUnitPriceCurrency ?? maxUnitPriceCurrency;
      const effectiveStrictPriceLimit =
        overrides.strictPriceLimit ?? strictPriceLimit;
      const parsedMaxUnitPrice = optionalNumber(effectiveMaxUnitPrice);
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
            : effectiveMaxUnitPriceCurrency.toUpperCase(),
          strictPriceLimit: parsedMaxUnitPrice !== undefined && effectiveStrictPriceLimit,
          maxMoq: optionalNumber(maxMoq),
          targetMarginPercent: optionalNumber(targetMarginPercent),
          avoidComplexCompliance,
          privateLabel,
        }),
      });
      const payload = (await response.json()) as {
        results?: SupplierOfferSearchResult[];
        candidateAnalyses?: TajaCandidateAnalysis[];
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
      setCandidateAnalyses(payload.candidateAnalyses ?? []);
      setLunaPlan(payload.lunaPlan ?? null);
      setFetchedAt(payload.fetchedAt ?? null);
      setUnfilteredResultCount(payload.unfilteredResultCount ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error && searchError.message
        ? searchError.message
        : t("Pretraga trenutno nije dostupna. Pokušajte ponovo."));
      setProviderStatus("error");
      setResults([]);
      setCandidateAnalyses([]);
      setLunaPlan(null);
      setFetchedAt(null);
      setUnfilteredResultCount(null);
    } finally {
      setLoading(false);
    }
  }, [
    avoidComplexCompliance,
    maxMoq,
    maxUnitPrice,
    maxUnitPriceCurrency,
    privateLabel,
    projectId,
    query,
    searchCountry,
    searchQuantity,
    strictPriceLimit,
    t,
    targetMarginPercent,
  ]);

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
  }, [query, runSearch, searchCountry, searchQuantity]);

  useEffect(() => {
    function handleRecoverySearch(event: Event) {
      const criteria = readRecoverySearchCriteria(
        (event as CustomEvent<unknown>).detail,
      );
      if (!criteria) return;

      setMaxUnitPrice(criteria.maxUnitPrice);
      setMaxUnitPriceCurrency(criteria.currency);
      setStrictPriceLimit(true);
      setRecoveryCriteria(criteria);
      if (criteriaDetailsRef.current) criteriaDetailsRef.current.open = true;
      void runSearch({
        maxUnitPrice: criteria.maxUnitPrice,
        maxUnitPriceCurrency: criteria.currency,
        strictPriceLimit: true,
      });
    }

    window.addEventListener(RECOVERY_SEARCH_EVENT, handleRecoverySearch);
    return () => window.removeEventListener(RECOVERY_SEARCH_EVENT, handleRecoverySearch);
  }, [runSearch]);

  function markImported(index: number) {
    setImported((current) => current.includes(index) ? current : [...current, index]);
  }

  async function addResult(result: SupplierOfferSearchResult, index: number) {
    setImporting(index);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json()) as { error?: string; existingOfferId?: string };
      if (response.status === 409 && payload.existingOfferId) {
        markImported(index);
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      markImported(index);
    } catch (importError) {
      setError(importError instanceof Error && importError.message
        ? importError.message
        : t("Ponuda nije dodata. Pokušajte ponovo."));
    } finally {
      setImporting(null);
    }
  }

  function continueWithSelectedOffers() {
    if (imported.length === 0) return;
    startAdvancing(() => {
      router.refresh();
    });
  }

  const strictFilterRemovedAll = Boolean(
    recoveryCriteria &&
    results?.length === 0 &&
    unfilteredResultCount !== null &&
    unfilteredResultCount > 0,
  );
  const recommendedResults = results?.slice(0, 3) ?? [];
  const otherResults = results?.slice(3) ?? [];
  const visibleOtherResults = showAllResults
    ? otherResults
    : otherResults.slice(0, INITIAL_OTHER_RESULTS);
  const candidateAnalysisByUrl = new Map(
    candidateAnalyses.map((analysis) => [analysis.productUrl, analysis]),
  );
  const hasFinalTopAnalysis = recommendedResults.some(
    (result) => candidateAnalysisByUrl.get(result.productUrl)?.status === "FINAL",
  );

  function missingDataText(keys: TajaMissingDataKey[]) {
    return keys.map((key) => analysisText.missing[key]).join(", ");
  }

  function renderResultCard(
    result: SupplierOfferSearchResult,
    index: number,
    recommendationRank?: number,
  ) {
    const analysis = candidateAnalysisByUrl.get(result.productUrl);
    const recommendationLabel = analysis?.status === "FINAL"
      ? analysisText.recommendation[analysis.recommendationStatus]
      : analysisText.preliminary;

    return (
      <article className="search-result-card" key={`${result.source}-${result.productUrl}`}>
        {result.imageUrl && (
          // Provider URLs are validated and rendered without proxying or persisting image bytes.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="search-result-image" loading="lazy" src={result.imageUrl} />
        )}
        <div>
          <p className="eyebrow">{result.source}</p>
          {(recommendationRank !== undefined || analysis?.status === "FINAL") && (
            <span className={`provider-status ${analysis?.recommendationStatus === "NOT_RECOMMENDED" ? "provider-status-error" : "provider-status-connected"}`}>
              {recommendationRank !== undefined
                ? `#${recommendationRank} ${analysis?.status === "FINAL" ? recommendationLabel : recommendationText.rankPreliminary(recommendationRank).replace(/^#\d+\s*/, "")}`
                : recommendationLabel}
            </span>
          )}
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
          {analysis && <TajaRequirementMatchPanel match={analysis.requirementMatch} />}
          {analysis && (
            <div>
              <p>
                <strong>{analysisText.score}:</strong> {analysis.overallScore}/100
                {" · "}
                <strong>{analysisText.confidence}:</strong> {analysis.confidenceScore}%
                {" · "}
                <strong>{analysisText.riskLabel}:</strong> {analysisText.risk[analysis.supplierRiskLevel]}
                {" · "}
                <strong>{analysisText.landedCostLabel}:</strong> {analysisText.landedCost[analysis.landedCostStatus]}
              </p>
              <p className="muted-text">{analysis.explanation}</p>
              {analysis.missingData.length > 0 && (
                <p className="muted-text">
                  <strong>{analysisText.missingLabel}:</strong>{" "}
                  {missingDataText(analysis.missingData)}
                </p>
              )}
            </div>
          )}
          <a href={result.productUrl} rel="noreferrer" target="_blank">{t("Otvori izvornu ponudu")}</a>
        </div>
        <button
          className="secondary-button"
          disabled={importing === index || imported.includes(index)}
          onClick={() => addResult(result, index)}
          type="button"
        >
          {imported.includes(index)
            ? comparisonText.added
            : importing === index
              ? comparisonText.adding
              : comparisonText.add}
        </button>
      </article>
    );
  }

  return (
    <section className="dashboard-card supplier-search">
      <header className="section-header">
        <div>
          <h2>{lunaCopy.title}</h2>
          <p>{lunaCopy.description}</p>
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
      {recoveryCriteria && (
        <div className="empty-state" role="status">
          <strong>{recoveryCopy.activeLimit(
            recoveryCriteria.maxUnitPrice,
            recoveryCriteria.currency,
          )}</strong>
        </div>
      )}
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
      <details ref={criteriaDetailsRef}>
        <summary>{lunaCopy.criteria}</summary>
        <div className="supplier-search-form">
          <label>
            {lunaCopy.maxUnitPrice}
            <input
              min="0.01"
              onChange={(event) => {
                setMaxUnitPrice(event.target.value);
                clearRecoveryMode();
              }}
              step="0.01"
              type="number"
              value={maxUnitPrice}
            />
          </label>
          <label>
            {lunaCopy.currency}
            <input
              maxLength={3}
              onChange={(event) => {
                setMaxUnitPriceCurrency(event.target.value.toUpperCase());
                clearRecoveryMode();
              }}
              pattern="[A-Za-z]{3}"
              value={maxUnitPriceCurrency}
            />
          </label>
          <label>
            {lunaCopy.maxMoq}
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
          {lunaCopy.avoidComplexCompliance}
        </label>
        <label className="project-values-toggle">
          <input
            checked={privateLabel}
            onChange={(event) => setPrivateLabel(event.target.checked)}
            type="checkbox"
          />
          {lunaCopy.privateLabel}
        </label>
      </details>
      <form className="supplier-search-form" onSubmit={search}>
        <label>
          {t("Proizvod")}
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              clearRecoveryMode();
            }}
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
              clearRecoveryMode();
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
              clearRecoveryMode();
            }}
            pattern="[A-Za-z]{2}"
            required
            value={searchCountry}
          />
        </label>
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? lunaCopy.searching : lunaCopy.startSearch}
        </button>
      </form>
      {loading && <TajaSearchLoadingNotice />}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {lunaPlan && (
        <div className="empty-state">
          <h3>{lunaCopy.preparedQueries}</h3>
          <p><strong>Alibaba / Made-in-China:</strong> {lunaPlan.providerQuery}</p>
          <p>
            <strong>1688:</strong>{" "}
            {lunaPlan.chinese1688Query ?? lunaCopy.chineseConfirmationRequired}
          </p>
          {unfilteredResultCount !== null && results && unfilteredResultCount !== results.length && (
            <p>{lunaCopy.filteredResultsPrefix}: {unfilteredResultCount - results.length}</p>
          )}
          {fetchedAt && <p className="muted-text">{lunaCopy.fetchedAt}: {new Date(fetchedAt).toLocaleString(locale)}</p>}
          {lunaPlan.warnings.map((warning) => (
            <p className="muted-text" key={warning}>{lunaCopy.warnings[warning]}</p>
          ))}
        </div>
      )}
      {results === null && !loading && <p className="muted-text">{t("Unesite proizvod da biste pronašli ponude.")}</p>}
      {results?.length === 0 && (
        <div className="empty-state">
          <h3>
            {strictFilterRemovedAll && recoveryCriteria
              ? recoveryCopy.noMatchesTitle
              : t("Automatska pretraga trenutno nije dostupna.")}
          </h3>
          <p>
            {strictFilterRemovedAll && recoveryCriteria
              ? recoveryCopy.noMatchesDescription(
                  recoveryCriteria.maxUnitPrice,
                  recoveryCriteria.currency,
                )
              : t("Koristite „Uvezi iz linka” ili „Ručno dodaj ponudu”.")}
          </p>
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
          <div className="empty-state">
            <h3>
              {hasFinalTopAnalysis
                ? recommendationText.analyzedTitle
                : recommendationText.preliminaryTitle}
            </h3>
            <p>
              {hasFinalTopAnalysis
                ? recommendationText.analyzedDescription
                : recommendationText.preliminaryDescription}
            </p>
          </div>
          {recommendedResults.map((result, index) =>
            renderResultCard(result, index, index + 1),
          )}
          {otherResults.length > 0 && (
            <>
              <div className="empty-state">
                <h3>{recommendationText.otherTitle}</h3>
                <p>{recommendationText.otherDescription(otherResults.length)}</p>
              </div>
              {visibleOtherResults.map((result, index) =>
                renderResultCard(result, index + 3),
              )}
              {otherResults.length > INITIAL_OTHER_RESULTS && (
                <button
                  className="secondary-button"
                  onClick={() => setShowAllResults((current) => !current)}
                  type="button"
                >
                  {showAllResults
                    ? recommendationText.showLess
                    : recommendationText.showAll(otherResults.length)}
                </button>
              )}
            </>
          )}
          {imported.length > 0 && (
            <div className="empty-state search-comparison-actions" role="status">
              <h3>{comparisonText.selected(imported.length)}</h3>
              <p>{comparisonText.instructions}</p>
              <button
                className="primary-button"
                disabled={isAdvancing}
                onClick={continueWithSelectedOffers}
                type="button"
              >
                {isAdvancing ? comparisonText.continuing : comparisonText.continue}
              </button>
            </div>
          )}
        </div>
      )}
      </>}
    </section>
  );
}
