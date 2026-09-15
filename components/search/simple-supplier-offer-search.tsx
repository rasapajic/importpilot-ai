"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { SearchResultImage } from "@/components/search/search-result-image";
import type { FxSnapshot } from "@/modules/fx/euro-display";
import type { Locale } from "@/modules/i18n/translations";
import { matchesExplicitProductSpecifications } from "@/modules/product-search/domain/explicit-spec-match";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import { estimateTajaPreliminaryLandedCost } from "@/modules/product-search/domain/taja-preliminary-cost-estimate";
import type { TajaCandidateAnalysisWithProductForm } from "@/modules/product-search/domain/taja-product-form-policy";

type ResultOrigin = "live" | "cache";

type SimpleSupplierSearchInitialOutcome = {
  results: SupplierOfferSearchResult[];
  candidateAnalyses: TajaCandidateAnalysisWithProductForm[];
  resultOrigin: ResultOrigin;
  fetchedAt: string;
};

type Copy = {
  title: string;
  description: string;
  searching: string;
  search: string;
  retry: string;
  noResults: string;
  noResultsText: string;
  supplierPrice: string;
  landedCost: string;
  landedEstimate: string;
  landedPending: string;
  delivery: string;
  supplierRisk: string;
  moq: string;
  incoterm: string;
  details: string;
  confidence: string;
  score: string;
  missing: string;
  source: string;
  select: string;
  selecting: string;
  cached: string;
  unknown: string;
  risk: Record<"LOW" | "MEDIUM" | "HIGH" | "UNKNOWN", string>;
  decision: Record<"BUY" | "NEGOTIATE" | "WATCH" | "SKIP", string>;
};

const copy: Record<Locale, Copy> = {
  sr: {
    title: "Najbolje ponude",
    description: "ImportPilot je izdvojio ponude koje najviše odgovaraju proizvodu, količini i destinaciji.",
    searching: "Tražim i upoređujem ponude...",
    search: "Pronađi ponude",
    retry: "Pokušaj ponovo",
    noResults: "Nema dovoljno pouzdanih ponuda",
    noResultsText: "Nijedna pronađena ponuda ne potvrđuje sve eksplicitne specifikacije. Pokušajte ponovo; ImportPilot neće prikazati pogrešan proizvod samo da bi popunio listu.",
    supplierPrice: "Cena dobavljača",
    landedCost: "Landed cost",
    landedEstimate: "procena",
    landedPending: "računa se nakon izbora",
    delivery: "Rok",
    supplierRisk: "Dobavljač",
    moq: "MOQ",
    incoterm: "Incoterm",
    details: "Detalji analize",
    confidence: "Pouzdanost podataka",
    score: "Rezultat analize",
    missing: "Još treba proveriti",
    source: "Otvori izvornu ponudu",
    select: "Izaberi ponudu",
    selecting: "Otvaranje...",
    cached: "Prikazani su poslednji sačuvani rezultati.",
    unknown: "nije poznato",
    risk: { LOW: "nizak rizik", MEDIUM: "srednji rizik", HIGH: "visok rizik", UNKNOWN: "nije provereno" },
    decision: { BUY: "BUY", NEGOTIATE: "NEGOTIATE", WATCH: "WATCH", SKIP: "SKIP" },
  },
  de: {
    title: "Beste Angebote",
    description: "ImportPilot zeigt die Angebote, die am besten zu Produkt, Menge und Zielland passen.",
    searching: "Angebote werden gesucht und verglichen...",
    search: "Angebote finden",
    retry: "Erneut versuchen",
    noResults: "Keine ausreichend verlässlichen Angebote",
    noResultsText: "Kein gefundenes Angebot bestätigt alle ausdrücklich genannten Spezifikationen. Versuchen Sie es erneut; ImportPilot zeigt kein falsches Produkt nur um die Liste zu füllen.",
    supplierPrice: "Lieferantenpreis",
    landedCost: "Landed Cost",
    landedEstimate: "Schätzung",
    landedPending: "wird nach Auswahl berechnet",
    delivery: "Lieferzeit",
    supplierRisk: "Lieferant",
    moq: "MOQ",
    incoterm: "Incoterm",
    details: "Analysedetails",
    confidence: "Datenzuverlässigkeit",
    score: "Analyseergebnis",
    missing: "Noch zu prüfen",
    source: "Quellangebot öffnen",
    select: "Angebot auswählen",
    selecting: "Wird geöffnet...",
    cached: "Die letzten gespeicherten Ergebnisse werden angezeigt.",
    unknown: "unbekannt",
    risk: { LOW: "niedriges Risiko", MEDIUM: "mittleres Risiko", HIGH: "hohes Risiko", UNKNOWN: "nicht geprüft" },
    decision: { BUY: "BUY", NEGOTIATE: "NEGOTIATE", WATCH: "WATCH", SKIP: "SKIP" },
  },
  en: {
    title: "Best offers",
    description: "ImportPilot highlights the offers that best fit the product, quantity, and destination.",
    searching: "Finding and comparing offers...",
    search: "Find offers",
    retry: "Try again",
    noResults: "No sufficiently reliable offers",
    noResultsText: "No found offer confirms every explicit specification. Try again; ImportPilot will not show the wrong product just to fill the list.",
    supplierPrice: "Supplier price",
    landedCost: "Landed cost",
    landedEstimate: "estimate",
    landedPending: "calculated after selection",
    delivery: "Delivery",
    supplierRisk: "Supplier",
    moq: "MOQ",
    incoterm: "Incoterm",
    details: "Analysis details",
    confidence: "Data confidence",
    score: "Analysis score",
    missing: "Still to verify",
    source: "Open source offer",
    select: "Select offer",
    selecting: "Opening...",
    cached: "Showing the latest saved results.",
    unknown: "unknown",
    risk: { LOW: "low risk", MEDIUM: "medium risk", HIGH: "high risk", UNKNOWN: "not checked" },
    decision: { BUY: "BUY", NEGOTIATE: "NEGOTIATE", WATCH: "WATCH", SKIP: "SKIP" },
  },
};

function consumeAutomaticSearchFlag() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("autoSearch") !== "1") return;
  url.searchParams.delete("autoSearch");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function isFxSnapshotPayload(value: unknown): value is FxSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.baseCurrency === "EUR" &&
    typeof record.source === "string" &&
    typeof record.timestamp === "string" &&
    Boolean(record.ratesToEur) &&
    typeof record.ratesToEur === "object" &&
    !Array.isArray(record.ratesToEur);
}

function simpleDecision(analysis: TajaCandidateAnalysisWithProductForm | undefined) {
  if (!analysis || analysis.status !== "FINAL") return "WATCH" as const;
  if (analysis.recommendationStatus === "RECOMMENDED") return "BUY" as const;
  if (analysis.recommendationStatus === "NEEDS_NEGOTIATION") return "NEGOTIATE" as const;
  if (analysis.recommendationStatus === "NOT_RECOMMENDED") return "SKIP" as const;
  return "WATCH" as const;
}

function decisionClass(decision: ReturnType<typeof simpleDecision>) {
  if (decision === "BUY") return "provider-status-connected";
  if (decision === "SKIP") return "provider-status-error";
  return "provider-status-not_configured";
}

function formatMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "sr" ? "sr-RS" : locale === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function SimpleSupplierOfferSearch({
  projectId,
  productName,
  quantity,
  targetCountry,
  autoStart = false,
  initialOutcome = null,
}: {
  projectId: string;
  productName: string;
  quantity: number | null;
  targetCountry: string | null;
  autoStart?: boolean;
  initialOutcome?: SimpleSupplierSearchInitialOutcome | null;
}) {
  const { locale } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const [results, setResults] = useState<SupplierOfferSearchResult[] | null>(initialOutcome?.results ?? null);
  const [analyses, setAnalyses] = useState<TajaCandidateAnalysisWithProductForm[]>(initialOutcome?.candidateAnalyses ?? []);
  const [origin, setOrigin] = useState<ResultOrigin | null>(initialOutcome?.resultOrigin ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectingUrl, setSelectingUrl] = useState<string | null>(null);
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null);
  const automaticSearchStarted = useRef(false);

  const runSearch = useCallback(async () => {
    if (!quantity || !targetCountry) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: productName,
          quantity,
          targetCountry,
          avoidComplexCompliance: true,
          privateLabel: false,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        results?: SupplierOfferSearchResult[];
        candidateAnalyses?: TajaCandidateAnalysisWithProductForm[];
        resultOrigin?: ResultOrigin | null;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || text.noResultsText);
      setResults(payload?.results ?? []);
      setAnalyses(payload?.candidateAnalyses ?? []);
      setOrigin(payload?.resultOrigin ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.noResultsText);
      setResults([]);
      setAnalyses([]);
      setOrigin(null);
    } finally {
      setLoading(false);
    }
  }, [productName, projectId, quantity, targetCountry, text.noResultsText]);

  useEffect(() => {
    if (!autoStart || automaticSearchStarted.current || !quantity || !targetCountry || productName.trim().length < 2) return;
    automaticSearchStarted.current = true;
    consumeAutomaticSearchFlag();
    void runSearch();
  }, [autoStart, productName, quantity, runSearch, targetCountry]);

  useEffect(() => {
    const needsFx = Boolean(results?.some((result) => result.currency && result.currency !== "EUR"));
    if (!needsFx) return;

    const controller = new AbortController();
    void fetch("/api/fx/latest", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isFxSnapshotPayload(payload)) return;
        setFxSnapshot(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [results]);

  async function selectOffer(result: SupplierOfferSearchResult) {
    setSelectingUrl(result.productUrl);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/supplier-search/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      const payload = (await response.json().catch(() => null)) as {
        offerId?: string;
        existingOfferId?: string;
        error?: string;
      } | null;
      if (!response.ok && response.status !== 409) {
        throw new Error(payload?.error || text.noResultsText);
      }
      const selectedOfferId = response.ok ? payload?.offerId : payload?.existingOfferId;
      if (!selectedOfferId) throw new Error(payload?.error || text.noResultsText);

      router.push(
        `/projects/${projectId}?selectedOffer=${encodeURIComponent(selectedOfferId)}#workflow-step-decision`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.noResultsText);
      setSelectingUrl(null);
    }
  }

  const analysisByUrl = new Map(analyses.map((analysis) => [analysis.productUrl, analysis]));
  const specificationMatches = (results ?? []).filter((result) =>
    matchesExplicitProductSpecifications(productName, result),
  );
  const ranked = specificationMatches
    .map((result, index) => ({ result, index, analysis: analysisByUrl.get(result.productUrl) }))
    .filter((entry) => entry.analysis?.productForm.matchStatus !== "MISMATCH")
    .sort((left, right) => (left.analysis?.rank ?? left.index + 100) - (right.analysis?.rank ?? right.index + 100));
  const visible = ranked.slice(0, 5);
  const noReliableResults = results !== null && !loading && visible.length === 0;

  return (
    <section className="dashboard-card supplier-search">
      <header className="section-header">
        <div>
          <h2>{text.title}</h2>
          <p>{text.description}</p>
        </div>
      </header>

      {loading && <p className="muted-text" role="status">{text.searching}</p>}
      {origin === "cache" && !loading && <p className="muted-text" role="status">{text.cached}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {results === null && !loading && (
        <button className="primary-button" onClick={() => void runSearch()} type="button">{text.search}</button>
      )}

      {noReliableResults && (
        <div className="empty-state">
          <h3>{text.noResults}</h3>
          <p>{text.noResultsText}</p>
          <button className="secondary-button" onClick={() => void runSearch()} type="button">{text.retry}</button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="search-result-list">
          {visible.map(({ result, analysis }, index) => {
            const decision = simpleDecision(analysis);
            const liveEstimate = quantity && targetCountry
              ? estimateTajaPreliminaryLandedCost({
                  result,
                  quantity,
                  targetCountry,
                  targetMarginPercent: 0,
                  fxSnapshot: result.currency === "EUR" ? null : fxSnapshot,
                })
              : null;
            const deliveryEstimate = liveEstimate ?? analysis?.preliminaryCostEstimate ?? null;
            const selecting = selectingUrl === result.productUrl;
            return (
              <article className="search-result-card" key={`${result.source}-${result.productUrl}`}>
                <SearchResultImage src={result.imageUrl} title={result.title} />
                <div>
                  <p className="eyebrow">#{index + 1} · {result.supplierName}</p>
                  <span className={`provider-status ${decisionClass(decision)}`}>{text.decision[decision]}</span>
                  <h3>{result.title}</h3>
                  <div className="offer-highlights">
                    <span>
                      {text.supplierPrice}
                      <strong>{result.price !== null && result.currency ? `${result.price} ${result.currency}` : text.unknown}</strong>
                    </span>
                    <span>
                      {text.landedCost}
                      <strong>{liveEstimate ? `≈ ${formatMoney(liveEstimate.basePerUnitEur, locale)} / kom (${text.landedEstimate})` : text.landedPending}</strong>
                    </span>
                    <span>
                      {text.delivery}
                      <strong>{deliveryEstimate?.deliveryTimeDays ?? text.unknown}</strong>
                    </span>
                    <span>
                      {text.supplierRisk}
                      <strong>{analysis ? text.risk[analysis.supplierRiskLevel] : text.risk.UNKNOWN}</strong>
                    </span>
                  </div>

                  <details>
                    <summary>{text.details}</summary>
                    <p>{text.moq}: {result.minimumOrderQuantity ?? text.unknown} · {text.incoterm}: {result.incoterm ?? text.unknown}</p>
                    {liveEstimate && (
                      <p>
                        {text.landedCost}: {formatMoney(liveEstimate.lowPerUnitEur, locale)} – {formatMoney(liveEstimate.highPerUnitEur, locale)} / kom
                      </p>
                    )}
                    {analysis && (
                      <>
                        <p>{text.score}: {analysis.overallScore}/100 · {text.confidence}: {analysis.confidenceScore}%</p>
                        <p className="muted-text">{analysis.explanation}</p>
                        {analysis.missingData.length > 0 && <p className="muted-text">{text.missing}: {analysis.missingData.join(", ")}</p>}
                      </>
                    )}
                    <p><a href={result.productUrl} rel="noreferrer" target="_blank">{text.source}</a></p>
                  </details>
                </div>
                <button
                  className="secondary-button"
                  disabled={selecting}
                  onClick={() => void selectOffer(result)}
                  type="button"
                >
                  {selecting ? text.selecting : text.select}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
