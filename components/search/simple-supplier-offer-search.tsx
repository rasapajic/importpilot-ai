"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { SearchResultImage } from "@/components/search/search-result-image";
import {
  quantityPriceSnapshots,
  supplierOfferForQuantity,
  supplierOfferVariantFacts,
} from "@/components/search/supplier-choice-display";
import type { FxSnapshot } from "@/modules/fx/euro-display";
import type { Locale } from "@/modules/i18n/translations";
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
  selected: string;
  selecting: string;
  selectionSummary: (count: number) => string;
  selectionInstructions: string;
  continueWithSelected: string;
  continuing: string;
  cached: string;
  unknown: string;
  variants: string;
  type: string;
  quantityPrices: string;
  pieces: string;
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
    noResultsText: "Pokušajte ponovo. ImportPilot neće prikazati nepouzdanu ponudu samo da bi popunio listu.",
    supplierPrice: "Cena dobavljača",
    landedCost: "Ukupni trošak uvoza",
    landedEstimate: "procena",
    landedPending: "računa se nakon izbora",
    delivery: "Rok",
    supplierRisk: "Dobavljač",
    moq: "Minimalna količina (MOQ)",
    incoterm: "Uslov isporuke (Incoterm)",
    details: "Detalji analize",
    confidence: "Pouzdanost podataka",
    score: "Rezultat analize",
    missing: "Još treba proveriti",
    source: "Otvori izvornu ponudu",
    select: "Dodaj za poređenje",
    selected: "Dodato za poređenje",
    selecting: "Dodavanje...",
    selectionSummary: (count) => `Odabrano za poređenje: ${count}`,
    selectionInstructions: "Dodajte sve ponude koje želite, pa tek onda nastavite.",
    continueWithSelected: "Nastavi sa odabranim ponudama",
    continuing: "Otvaranje sledećeg koraka...",
    cached: "Prikazani su poslednji sačuvani rezultati.",
    unknown: "nije poznato",
    variants: "Varijante",
    type: "Tip",
    quantityPrices: "Cene po količini",
    pieces: "kom",
    risk: { LOW: "nizak rizik", MEDIUM: "srednji rizik", HIGH: "visok rizik", UNKNOWN: "nije provereno" },
    decision: { BUY: "KUPI", NEGOTIATE: "PREGOVARAJ", WATCH: "PRATI", SKIP: "PRESKOČI" },
  },
  de: {
    title: "Beste Angebote",
    description: "ImportPilot zeigt die Angebote, die am besten zu Produkt, Menge und Zielland passen.",
    searching: "Angebote werden gesucht und verglichen...",
    search: "Angebote finden",
    retry: "Erneut versuchen",
    noResults: "Keine ausreichend verlässlichen Angebote",
    noResultsText: "Versuchen Sie es erneut. ImportPilot zeigt kein unzuverlässiges Angebot nur um die Liste zu füllen.",
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
    select: "Zum Vergleich hinzufügen",
    selected: "Für den Vergleich hinzugefügt",
    selecting: "Wird hinzugefügt...",
    selectionSummary: (count) => `Für den Vergleich ausgewählt: ${count}`,
    selectionInstructions: "Fügen Sie alle gewünschten Angebote hinzu und fahren Sie erst danach fort.",
    continueWithSelected: "Mit ausgewählten Angeboten fortfahren",
    continuing: "Nächster Schritt wird geöffnet...",
    cached: "Die letzten gespeicherten Ergebnisse werden angezeigt.",
    unknown: "unbekannt",
    variants: "Varianten",
    type: "Typ",
    quantityPrices: "Mengenpreise",
    pieces: "Stk.",
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
    noResultsText: "Try again. ImportPilot will not show an unreliable offer just to fill the list.",
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
    select: "Add for comparison",
    selected: "Added for comparison",
    selecting: "Adding...",
    selectionSummary: (count) => `Selected for comparison: ${count}`,
    selectionInstructions: "Add every offer you want to compare, then continue when your selection is complete.",
    continueWithSelected: "Continue with selected offers",
    continuing: "Opening the next step...",
    cached: "Showing the latest saved results.",
    unknown: "unknown",
    variants: "Variants",
    type: "Type",
    quantityPrices: "Quantity prices",
    pieces: "pcs",
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

function numberLocale(locale: Locale) {
  return locale === "sr" ? "sr-RS" : locale === "de" ? "de-DE" : "en-US";
}

function formatMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSupplierPrice(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatQuantity(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(value);
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
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [advancing, setAdvancing] = useState(false);
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
    const needsFx = Boolean(results?.some((result) => {
      const effectiveResult = supplierOfferForQuantity(result, quantity);
      return effectiveResult.currency && effectiveResult.currency !== "EUR";
    }));
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
  }, [quantity, results]);

  async function selectOffer(result: SupplierOfferSearchResult) {
    if (selectedUrls.includes(result.productUrl)) return;
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

      setSelectedUrls((current) => current.includes(result.productUrl)
        ? current
        : [...current, result.productUrl]);
      setSelectedOfferIds((current) => current.includes(selectedOfferId)
        ? current
        : [...current, selectedOfferId]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.noResultsText);
    } finally {
      setSelectingUrl(null);
    }
  }

  function continueWithSelectedOffers() {
    if (selectedOfferIds.length === 0 || advancing) return;
    setAdvancing(true);
    router.push(`/projects/${projectId}#workflow-step-decision`);
    router.refresh();
  }

  const analysisByUrl = new Map(analyses.map((analysis) => [analysis.productUrl, analysis]));
  const ranked = (results ?? [])
    .map((result, index) => ({ result, index, analysis: analysisByUrl.get(result.productUrl) }))
    .filter((entry) => entry.analysis?.productForm.matchStatus !== "MISMATCH")
    .sort((left, right) => (left.analysis?.rank ?? left.index + 100) - (right.analysis?.rank ?? right.index + 100));
  const visible = (ranked.length > 0 ? ranked : (results ?? []).map((result, index) => ({
    result,
    index,
    analysis: analysisByUrl.get(result.productUrl),
  }))).slice(0, 10);

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

      {results?.length === 0 && !loading && (
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
            const effectiveResult = supplierOfferForQuantity(result, quantity);
            const priceSnapshots = quantityPriceSnapshots(result, quantity);
            const variantFacts = supplierOfferVariantFacts(result);
            const liveEstimate = quantity && targetCountry
              ? estimateTajaPreliminaryLandedCost({
                  result: effectiveResult,
                  quantity,
                  targetCountry,
                  targetMarginPercent: 0,
                  fxSnapshot: effectiveResult.currency === "EUR" ? null : fxSnapshot,
                })
              : null;
            const deliveryEstimate = liveEstimate ?? analysis?.preliminaryCostEstimate ?? null;
            const selecting = selectingUrl === result.productUrl;
            const selected = selectedUrls.includes(result.productUrl);
            return (
              <article className="search-result-card" key={`${result.source}-${result.productUrl}`}>
                <SearchResultImage src={result.imageUrl} title={result.title} />
                <div>
                  <p className="eyebrow">
                    <a
                      className="supplier-source-link"
                      href={result.productUrl}
                      rel="noreferrer"
                      target="_blank"
                      aria-label={`${text.source}: ${result.supplierName}`}
                    >
                      #{index + 1} · {result.supplierName}
                    </a>
                  </p>
                  <span className={`provider-status ${decisionClass(decision)}`}>{text.decision[decision]}</span>
                  <h3>{result.title}</h3>
                  <div className="offer-highlights">
                    <span>
                      {text.supplierPrice}
                      <strong>
                        {effectiveResult.price !== null && effectiveResult.currency
                          ? `${formatSupplierPrice(effectiveResult.price, effectiveResult.currency, locale)}${quantity ? ` / ${formatQuantity(quantity, locale)} ${text.pieces}` : ""}`
                          : text.unknown}
                      </strong>
                    </span>
                    <span>
                      {text.landedCost}
                      <strong>{liveEstimate ? `≈ ${formatMoney(liveEstimate.basePerUnitEur, locale)} / ${text.pieces} (${text.landedEstimate})` : text.landedPending}</strong>
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

                  {(variantFacts.groups.length > 0 || variantFacts.types.length > 0) && (
                    <p className="muted-text">
                      {variantFacts.types.length > 0 && (
                        <><strong>{text.type}:</strong> {variantFacts.types.join(" · ")}</>
                      )}
                      {variantFacts.types.length > 0 && variantFacts.groups.length > 0 ? " · " : ""}
                      {variantFacts.groups.length > 0 && (
                        <><strong>{text.variants}:</strong> {variantFacts.groups.map((group) => `${group.name}: ${group.values.join(", ")}`).join(" · ")}</>
                      )}
                    </p>
                  )}

                  <p className="muted-text">
                    <strong>{text.quantityPrices}:</strong>{" "}
                    {priceSnapshots.map((snapshot) => (
                      `${formatQuantity(snapshot.quantity, locale)} ${text.pieces}: ${snapshot.price !== null && snapshot.currency
                        ? formatSupplierPrice(snapshot.price, snapshot.currency, locale)
                        : text.unknown}`
                    )).join(" · ")}
                  </p>

                  <details>
                    <summary>{text.details}</summary>
                    <p>{text.moq}: {result.minimumOrderQuantity ?? text.unknown} · {text.incoterm}: {result.incoterm ?? text.unknown}</p>
                    {liveEstimate && (
                      <p>
                        {text.landedCost}: {formatMoney(liveEstimate.lowPerUnitEur, locale)} – {formatMoney(liveEstimate.highPerUnitEur, locale)} / {text.pieces}
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
                  disabled={selecting || selected}
                  onClick={() => void selectOffer(effectiveResult)}
                  type="button"
                >
                  {selected ? text.selected : selecting ? text.selecting : text.select}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selectedOfferIds.length > 0 && (
        <div className="empty-state" role="status">
          <p><strong>{text.selectionSummary(selectedOfferIds.length)}</strong></p>
          <p>{text.selectionInstructions}</p>
          <button
            className="primary-button"
            disabled={advancing}
            onClick={continueWithSelectedOffers}
            type="button"
          >
            {advancing ? text.continuing : `${text.continueWithSelected} (${selectedOfferIds.length})`}
          </button>
        </div>
      )}
    </section>
  );
}
