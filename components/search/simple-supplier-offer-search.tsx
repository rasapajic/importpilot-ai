"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/i18n/i18n-provider";
import { SourceMoqVerificationPanel } from "@/components/search/source-moq-verification-panel";
import {
  resultWithSourceMoq,
  type SourceMoqEvidence,
} from "@/modules/product-search/domain/source-moq-reconciliation";
import {
  isLikelyProductImageUrl,
  SearchResultImage,
} from "@/components/search/search-result-image";
import {
  SupplierConfirmationPanel,
  supplierConfirmationCopy,
} from "@/components/search/supplier-confirmation-panel";
import {
  quantityPriceSnapshots,
  supplierPriceTierSnapshots,
  supplierOfferForQuantity,
  supplierOfferVariantFacts,
} from "@/components/search/supplier-choice-display";
import { convertToEur, type FxSnapshot } from "@/modules/fx/euro-display";
import type { Locale } from "@/modules/i18n/translations";
import type {
  SupplierOfferSearchResult,
  SupplierOfferSearchSummary,
  SupplierOfferUrlPreview,
} from "@/modules/product-search/domain/search";
import type { SupplierOfferMarketplaceSupplierProfile } from "@/modules/product-search/domain/marketplace-product-details";
import {
  allowGenericProductMatchClaim,
  canPresentBestChoice,
  evaluateExplicitProductConstraintsForQueries,
} from "@/modules/product-search/domain/explicit-product-constraints";
import { formatMissingDataLabels } from "@/modules/product-search/domain/taja-missing-data-copy";
import { unverifiedPresentationTies } from "@/modules/product-search/domain/unverified-offer-presentation";
import {
  inquiryContactPriority,
  preliminaryAdvertisedScorePresentation,
} from "@/modules/product-search/domain/advertised-price-tie-break";
import { estimateTajaPreliminaryLandedCost } from "@/modules/product-search/domain/taja-preliminary-cost-estimate";
import {
  presentSupplierOfferPrice,
  presentSupplierOrderTerms,
  type SupplierOfferPricePresentation,
} from "@/modules/product-search/domain/supplier-quantity-pricing";
import {
  classifySupplierSearchOutcome,
  type SupplierSearchDisposition,
  type SupplierSearchFailureCode,
} from "@/modules/product-search/domain/search-outcome";
import type { TajaCandidateAnalysisWithProductForm } from "@/modules/product-search/domain/taja-product-form-policy";

type ResultOrigin = "live" | "cache";

type SimpleSupplierSearchInitialOutcome = {
  results: SupplierOfferSearchResult[];
  candidateAnalyses: TajaCandidateAnalysisWithProductForm[];
  resultOrigin: ResultOrigin;
  fetchedAt: string;
  unfilteredResultCount?: number;
  summary?: SupplierOfferSearchSummary;
  liveProviderFailed?: boolean;
  returnedFromCache?: boolean;
  failureCode?: SupplierSearchFailureCode | null;
};

type Copy = {
  title: string;
  description: string;
  emptyDescription: string;
  searching: string;
  search: string;
  retry: string;
  noResults: string;
  noResultsText: string;
  supplierPrice: string;
  supplierOrderTotal: (quantity: string) => string;
  fxConversionNote: string;
  landedCost: string;
  landedEstimate: string;
  landedPending: string;
  delivery: string;
  supplierRisk: string;
  supplierProfile: string;
  supplierRiskDeferred: string;
  supplierRiskMissing: (items: string) => string;
  supplierIdentity: string;
  supplierPlatformVerification: string;
  supplierBusinessHistory: string;
  supplierPlatformSignalsAvailable: string;
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
  liveNotice: string;
  cachedAfterFailure: string;
  failedSearch: string;
  failedSearchText: string;
  liveRefresh: string;
  selectionOverview: (reviewed: number, shown: number) => string;
  cachedSelectionOverview: (shown: number) => string;
  liveSelectionOverview: (found: number, relevant: number, shown: number) => string;
  bestChoice: string;
  preliminaryCandidate: string;
  preliminaryCandidateWarning: string;
  notARecommendation: string;
  needsConfirmation: string;
  disqualifiedProduct: string;
  selectionCriteria: string;
  whySelected: string;
  knownFacts: string;
  equivalentUnverified: (count: number, score: number, confidence: number) => string;
  inquiryOrderTitle: string;
  inquiryBatch: string;
  inquiryPriority: (position: number) => string;
  confirmedFinalOffer: string;
  lowestUnconfirmedAdvertised: string;
  inquiryPriceReason: (position: number, moq: string) => string;
  excludedFromInquiry: string;
  priceNotComparable: string;
  advertisedScoreBonus: (bonus: number) => string;
  advertisedNotConfirmedForMixed: (quantity: string | null) => string;
  conditionalAdvertisedPrice: string;
  reasonProductMatch: string;
  reasonProductLikely: string;
  variantMixUnconfirmed: string;
  mixingConfirmed: string;
  orderTermsUnconfirmed: string;
  listedMoq: (quantity: string) => string;
  minimumAboveRequest: (requested: string, minimum: string) => string;
  stockMoq: (quantity: string) => string;
  productionMoq: (quantity: string) => string;
  variantMoq: (quantity: string) => string;
  reasonPriceKnown: string;
  reasonPriceOnRequest: string;
  informationalPrice: string;
  pageTierNote: string;
  publishedTierPrice: string;
  writtenQuotePrice: string;
  quantityPriceUnconfirmed: (quantity: string | null) => string;
  advertisedPriceLabel: string;
  advertisedRangeNote: string;
  advertisedNotForQuantity: string;
  advertisedAppliesFrom: (quantity: string) => string;
  reasonDataConfidence: string;
  unknown: string;
  priceOnRequest: string;
  variants: string;
  type: string;
  quantityPrices: string;
  pieces: string;
  limitReachedAction: string;
  risk: Record<"LOW" | "MEDIUM" | "HIGH" | "UNKNOWN", string>;
  decision: Record<"BUY" | "NEGOTIATE" | "WATCH" | "SKIP", string>;
};

const copy: Record<Locale, Copy> = {
  sr: {
    title: "Najbolje ponude",
    description: "JAKOV360 je izdvojio ponude koje najviše odgovaraju proizvodu, količini i destinaciji.",
    emptyDescription: "Pokrenite pretragu za ovaj proizvod, količinu i destinaciju.",
    searching: "Tražim i upoređujem ponude...",
    search: "Pronađi ponude",
    retry: "Pokušaj ponovo",
    noResults: "Nema dovoljno pouzdanih ponuda",
    noResultsText: "Pokušajte ponovo. JAKOV360 neće prikazati nepouzdanu ponudu samo da bi popunio listu.",
    supplierPrice: "Cena dobavljača",
    supplierOrderTotal: (quantity) => `Za ${quantity} kom`,
    fxConversionNote: "Preračunato po kursu korišćenom za obračun uvoza.",
    landedCost: "Ukupno sa cenom uvoza",
    landedEstimate: "procena",
    landedPending: "čeka potvrđenu cenu dobavljača",
    delivery: "Rok isporuke",
    supplierRisk: "Rizik dobavljača",
    supplierProfile: "Podaci o dobavljaču",
    supplierRiskDeferred: "Detaljna provera rizika radi se tek za ponude koje dodate za poređenje. Kada platforma ne objavljuje verifikaciju i istoriju poslovanja, JAKOV360 neće ponavljati istu neproverenu procenu na svakoj ponudi.",
    supplierRiskMissing: (items) => `Nedostaju podaci: ${items}.`,
    supplierIdentity: "identitet firme",
    supplierPlatformVerification: "verifikacija na platformi",
    supplierBusinessHistory: "istorija poslovanja",
    supplierPlatformSignalsAvailable: "dostupni su pokazatelji sa platforme",
    incoterm: "Uslov isporuke (Incoterm)",
    details: "Detalji analize",
    confidence: "Pouzdanost podataka",
    score: "Preliminarna analiza",
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
    liveNotice: "Ovo su nove ponude iz trenutne pretrage.",
    cachedAfterFailure: "Nova pretraga nije uspela. Prikazani su poslednji sačuvani rezultati, ne nove ponude.",
    failedSearch: "Pretraga nije uspela",
    failedSearchText: "Nema sačuvanih rezultata za ovaj upit. JAKOV360 ne izmišlja cene niti prikazuje neproverene ponude kao stvarne.",
    liveRefresh: "Ponovi živu pretragu",
    selectionOverview: (reviewed, shown) => `JAKOV360 je pregledao ${reviewed} kandidata i prikazuje svih ${shown} dostupnih ponuda.`,
    cachedSelectionOverview: (shown) => `Prikazano je ${shown} sačuvanih ponuda iz prethodne pretrage. Ovo nije ukupan broj kandidata nove pretrage.`,
    liveSelectionOverview: (found, relevant, shown) => `Pronađeno ${found} kandidata → prikazano svih ${shown} dostupnih ponuda → ${relevant} trenutno prolazi osnovnu proveru.`,
    bestChoice: "Najbolji izbor",
    preliminaryCandidate: "Najbolji preliminarni kandidat",
    preliminaryCandidateWarning: "Ponuda, transport, carina i porezi još nisu provereni. Ovo nije konačan izbor.",
    notARecommendation: "Nije potvrđena preporuka",
    needsConfirmation: "Potrebna potvrda dobavljača. Tip proizvoda još nije dokazan.",
    disqualifiedProduct: "Ne odgovara zahtevu. Progresivna, podesiva ili drugačija dioptrija ne može biti najbolji izbor.",
    selectionCriteria: "Sve dostupne ponude su prikazane. Najbolji izbor postoji tek kada su nabavna cena i ukupan trošak uvoza potvrđeni. Pre toga prvi kandidat može biti samo preliminaran.",
    whySelected: "Zašto je izdvojena",
    knownFacts: "Šta je poznato",
    equivalentUnverified: (count, score, confidence) => `Isti rezultat ${score}/100 i ista pouzdanost ${confidence}% (${count}). To nije razlika u potvrđenom kvalitetu.`,
    inquiryOrderTitle: "Redosled kontaktiranja dobavljača",
    inquiryBatch: "Prioritet za slanje upita nije obavezan red. Možete odabrati više dobavljača i odobriti upite u istom koraku. Poruke se ne šalju same.",
    inquiryPriority: (position) => `Prioritet za upit ${position}`,
    confirmedFinalOffer: "Potvrđena konačna ponuda",
    lowestUnconfirmedAdvertised: "Najniža oglašena cena (nepotvrđena)",
    inquiryPriceReason: (position, moq) => `Prioritet za upit ${position} zbog uslovne oglašene cene u istoj valuti. MOQ iz oglasa ${moq} ne potvrđuje mešovite dioptrije, prihvaćenu količinu ni čvrstu cenu.`,
    excludedFromInquiry: "Izvor pokazuje neusklađen tip sočiva, pa oglašena cena ne ulazi u red za upit.",
    priceNotComparable: "Oglašene cene nisu isti osnov. Redosled nije napravljen po ceni jer nema dovoljno uporedivih dokaza.",
    advertisedScoreBonus: (bonus) => bonus > 0
      ? `Uslovna oglašena cena dodaje +${bonus} na preliminarnu analizu. Pouzdanost podataka se ne menja.`
      : "Nema dodatka za oglašenu cenu jer u ovom uporedivom skupu ova cena nije niža. Pouzdanost podataka se ne menja.",
    advertisedNotConfirmedForMixed: (quantity) => quantity
      ? `Oglašena cena nije potvrđena za ${quantity} mešovitih komada.`
      : "Oglašena cena nije potvrđena za traženu mešovitu količinu.",
    conditionalAdvertisedPrice: "Cena po oglasu (uslovna)",
    reasonProductMatch: "Proizvod odgovara traženom tipu ili specifikaciji.",
    reasonProductLikely: "Ponuda je relevantna za traženi proizvod, ali deo specifikacije još treba potvrditi.",
    variantMixUnconfirmed: "Mešanje varijanti u jednoj narudžbini nije potvrđeno.",
    mixingConfirmed: "Mešanje varijanti u jednoj narudžbini je izričito potvrđeno.",
    orderTermsUnconfirmed: "Uslovi za traženu količinu nisu potvrđeni.",
    listedMoq: (quantity) => `MOQ iz oglasa: ${quantity} komada — ne potvrđuje mogućnost narudžbine tražene količine ili mešanja varijanti.`,
    minimumAboveRequest: (requested, minimum) => `Traženo: ${requested} kom. · Minimum prodavca iz oglasa: ${minimum} kom. Oglašena cena nije potvrđena za ${requested} komada. Možete zatražiti potvrdu prodavca za traženu količinu.`,
    stockMoq: (quantity) => `MOQ za robu sa lagera: ${quantity}`,
    productionMoq: (quantity) => `MOQ za proizvodnju: ${quantity}`,
    variantMoq: (quantity) => `MOQ po modelu, boji ili varijanti: ${quantity}`,
    reasonPriceKnown: "Cena dobavljača je dostupna za poređenje.",
    reasonPriceOnRequest: "Cena nije uspešno preuzeta; proverite izvornu ponudu.",
    informationalPrice: "Oglašena cena. Nije potvrđena za traženu količinu i nije nabavni trošak.",
    pageTierNote: "Cena objavljenog količinskog razreda na stranici proizvoda. Nije ponuda dobavljača za ovu narudžbinu.",
    publishedTierPrice: "Cena objavljenog razreda",
    writtenQuotePrice: "Pisana ponuda dobavljača",
    quantityPriceUnconfirmed: (quantity) => quantity
      ? `Cena za ${quantity} komada nije potvrđena`
      : "Cena za traženu količinu nije potvrđena",
    advertisedPriceLabel: "Reklamirana cena",
    advertisedRangeNote: "Ovo je reklamirani raspon sa oglasa, nije čvrsta ponuda za traženu količinu.",
    advertisedNotForQuantity: "Nije potvrđena za traženu količinu.",
    advertisedAppliesFrom: (quantity) => `Važi tek od ${quantity} komada.`,
    reasonDataConfidence: "Dostupni podaci imaju dobru pouzdanost.",
    unknown: "nije poznato",
    priceOnRequest: "Cena nije preuzeta",
    variants: "Varijante",
    type: "Tip",
    quantityPrices: "Cene po količini",
    pieces: "kom",
    limitReachedAction: "Pogledaj Plus/Pro ili Full Import Analysis 1,99 €",
    risk: { LOW: "nizak rizik", MEDIUM: "srednji rizik", HIGH: "visok rizik", UNKNOWN: "nije moguće proceniti" },
    decision: { BUY: "KUPI", NEGOTIATE: "PREGOVARAJ", WATCH: "PRATI", SKIP: "PRESKOČI" },
  },
  de: {
    title: "Beste Angebote",
    description: "JAKOV360 zeigt die Angebote, die am besten zu Produkt, Menge und Zielland passen.",
    emptyDescription: "Starten Sie die Suche für dieses Produkt, die Menge und das Zielland.",
    searching: "Angebote werden gesucht und verglichen...",
    search: "Angebote finden",
    retry: "Erneut versuchen",
    noResults: "Keine ausreichend verlässlichen Angebote",
    noResultsText: "Versuchen Sie es erneut. JAKOV360 zeigt kein unzuverlässiges Angebot nur um die Liste zu füllen.",
    supplierPrice: "Lieferantenpreis",
    supplierOrderTotal: (quantity) => `Für ${quantity} Stk.`,
    fxConversionNote: "Umgerechnet mit dem für die Importkalkulation verwendeten Wechselkurs.",
    landedCost: "Gesamt inkl. Warenpreis und Importkosten",
    landedEstimate: "Schätzung",
    landedPending: "wartet auf bestätigten Lieferantenpreis",
    delivery: "Lieferzeit",
    supplierRisk: "Lieferantenrisiko",
    supplierProfile: "Lieferantendaten",
    supplierRiskDeferred: "Die detaillierte Risikoprüfung erfolgt für Angebote, die Sie zum Vergleich hinzufügen. Wenn die Plattform keine Verifizierung und Geschäftshistorie veröffentlicht, wiederholt JAKOV360 nicht bei jedem Angebot dieselbe unbestätigte Bewertung.",
    supplierRiskMissing: (items) => `Fehlende Daten: ${items}.`,
    supplierIdentity: "Unternehmensidentität",
    supplierPlatformVerification: "Plattform-Verifizierung",
    supplierBusinessHistory: "Geschäftshistorie",
    supplierPlatformSignalsAvailable: "Plattformdaten sind verfügbar",
    incoterm: "Incoterm",
    details: "Analysedetails",
    confidence: "Datenzuverlässigkeit",
    score: "Vorläufige Analyse",
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
    liveNotice: "Dies sind neue Angebote aus der aktuellen Suche.",
    cachedAfterFailure: "Die neue Suche ist fehlgeschlagen. Angezeigt werden die letzten gespeicherten Ergebnisse, nicht neue Angebote.",
    failedSearch: "Die Suche ist fehlgeschlagen",
    failedSearchText: "Für diese Anfrage gibt es keine gespeicherten Ergebnisse. JAKOV360 erfindet keine Preise und zeigt ungeprüfte Angebote nicht als reale Angebote an.",
    liveRefresh: "Live-Suche wiederholen",
    selectionOverview: (reviewed, shown) => `JAKOV360 hat ${reviewed} Kandidaten geprüft und zeigt alle ${shown} verfügbaren Angebote.`,
    cachedSelectionOverview: (shown) => `${shown} gespeicherte Angebote aus der vorherigen Suche werden angezeigt. Dies ist nicht die Gesamtzahl der Kandidaten einer neuen Suche.`,
    liveSelectionOverview: (found, relevant, shown) => `${found} Kandidaten gefunden → alle ${shown} verfügbaren Angebote werden angezeigt → ${relevant} bestehen derzeit die Grundprüfung.`,
    bestChoice: "Beste Wahl",
    preliminaryCandidate: "Bester vorläufiger Kandidat",
    preliminaryCandidateWarning: "Angebot, Transport, Zoll und Steuern sind noch nicht geprüft. Dies ist keine endgültige Auswahl.",
    notARecommendation: "Keine bestätigte Empfehlung",
    needsConfirmation: "Lieferantenbestätigung erforderlich. Der Produkttyp ist noch nicht nachgewiesen.",
    disqualifiedProduct: "Entspricht der Anfrage nicht. Progressive, verstellbare oder abweichende Dioptrien können nicht die beste Wahl sein.",
    selectionCriteria: "Alle verfügbaren Angebote werden angezeigt. Die endgültige beste Wahl gibt es erst, wenn Einkaufspreis und Landed Cost bestätigt sind. Davor kann der erste Kandidat nur vorläufig sein.",
    whySelected: "Warum ausgewählt",
    knownFacts: "Was bekannt ist",
    equivalentUnverified: (count, score, confidence) => `Dieselbe Bewertung ${score}/100 und dieselbe Zuverlässigkeit ${confidence}% (${count}). Das ist kein bestätigter Qualitätsunterschied.`,
    inquiryOrderTitle: "Reihenfolge der Lieferantenanfragen",
    inquiryBatch: "Die Priorität ist keine Pflichtreihenfolge. Sie können mehrere Lieferanten auswählen und die Anfragen im selben Schritt freigeben. Es wird nichts automatisch gesendet.",
    inquiryPriority: (position) => `Anfragepriorität ${position}`,
    confirmedFinalOffer: "Bestätigtes endgültiges Angebot",
    lowestUnconfirmedAdvertised: "Niedrigster angezeigter Preis (unbestätigt)",
    inquiryPriceReason: (position, moq) => `Anfragepriorität ${position} wegen des bedingten Anzeigenpreises in derselben Währung. MOQ laut Anzeige ${moq} bestätigt weder gemischte Dioptrien noch die akzeptierte Menge oder einen festen Preis.`,
    excludedFromInquiry: "Die Quelle zeigt einen unpassenden Linsentyp, daher zählt der Anzeigenpreis nicht für die Anfragereihenfolge.",
    priceNotComparable: "Die Anzeigenpreise sind keine gemeinsame Grundlage. Die Reihenfolge folgt nicht dem Preis, weil vergleichbare Nachweise fehlen.",
    advertisedScoreBonus: (bonus) => bonus > 0
      ? `Der bedingte Anzeigenpreis addiert +${bonus} zur vorläufigen Analyse. Die Datenzuverlässigkeit bleibt unverändert.`
      : "Kein Zuschlag für den Anzeigenpreis, weil dieser Preis im vergleichbaren Satz nicht niedriger ist. Die Datenzuverlässigkeit bleibt unverändert.",
    advertisedNotConfirmedForMixed: (quantity) => quantity
      ? `Der Anzeigenpreis ist nicht für ${quantity} gemischte Stück bestätigt.`
      : "Der Anzeigenpreis ist nicht für die gewünschte gemischte Menge bestätigt.",
    conditionalAdvertisedPrice: "Preis laut Anzeige (bedingt)",
    reasonProductMatch: "Das Produkt entspricht dem gesuchten Typ oder der Spezifikation.",
    reasonProductLikely: "Das Angebot ist relevant, ein Teil der Spezifikation muss jedoch noch bestätigt werden.",
    variantMixUnconfirmed: "Das Mischen von Varianten in einer Bestellung ist nicht bestätigt.",
    mixingConfirmed: "Das Mischen von Varianten in einer Bestellung ist ausdrücklich bestätigt.",
    orderTermsUnconfirmed: "Die Bedingungen für die gewünschte Menge sind nicht bestätigt.",
    listedMoq: (quantity) => `MOQ aus der Anzeige: ${quantity} Stück — bestätigt weder, dass die gewünschte Menge bestellt werden kann, noch dass Varianten gemischt werden dürfen.`,
    minimumAboveRequest: (requested, minimum) => `Gesucht: ${requested} Stück · Mindestmenge laut Anzeige: ${minimum} Stück. Der Anzeigenpreis gilt nicht nachweislich für ${requested} Stück. Fragen Sie den Verkäufer nach dieser Menge.`,
    stockMoq: (quantity) => `MOQ für Lagerware: ${quantity}`,
    productionMoq: (quantity) => `MOQ für die Produktion: ${quantity}`,
    variantMoq: (quantity) => `MOQ je Modell, Farbe oder Variante: ${quantity}`,
    reasonPriceKnown: "Der Lieferantenpreis ist für den Vergleich verfügbar.",
    reasonPriceOnRequest: "Der Preis wurde nicht erfolgreich abgerufen; prüfen Sie das Quellangebot.",
    informationalPrice: "Angebotspreis. Für die gewünschte Menge nicht bestätigt und kein bestätigter Einkaufspreis.",
    pageTierNote: "Preis der auf der Produktseite veröffentlichten Mengenstaffel. Kein Lieferantenangebot für diesen Auftrag.",
    publishedTierPrice: "Preis der veröffentlichten Staffel",
    writtenQuotePrice: "Schriftliches Lieferantenangebot",
    quantityPriceUnconfirmed: (quantity) => quantity
      ? `Preis für ${quantity} Stück ist nicht bestätigt`
      : "Preis für die gewünschte Menge ist nicht bestätigt",
    advertisedPriceLabel: "Beworbener Preis",
    advertisedRangeNote: "Dies ist die beworbene Preisspanne der Anzeige, kein festes Angebot für die gewünschte Menge.",
    advertisedNotForQuantity: "Für die gewünschte Menge nicht bestätigt.",
    advertisedAppliesFrom: (quantity) => `Gilt erst ab ${quantity} Stück.`,
    reasonDataConfidence: "Die verfügbaren Daten haben eine gute Zuverlässigkeit.",
    unknown: "unbekannt",
    priceOnRequest: "Preis nicht abgerufen",
    variants: "Varianten",
    type: "Typ",
    quantityPrices: "Mengenpreise",
    pieces: "Stk.",
    limitReachedAction: "Plus/Pro oder Full Import Analysis für 1,99 € ansehen",
    risk: { LOW: "niedriges Risiko", MEDIUM: "mittleres Risiko", HIGH: "hohes Risiko", UNKNOWN: "nicht bewertbar" },
    decision: { BUY: "BUY", NEGOTIATE: "NEGOTIATE", WATCH: "WATCH", SKIP: "SKIP" },
  },
  en: {
    title: "Best offers",
    description: "JAKOV360 highlights the offers that best fit the product, quantity, and destination.",
    emptyDescription: "Start a search for this product, quantity, and destination.",
    searching: "Finding and comparing offers...",
    search: "Find offers",
    retry: "Try again",
    noResults: "No sufficiently reliable offers",
    noResultsText: "Try again. JAKOV360 will not show an unreliable offer just to fill the list.",
    supplierPrice: "Supplier price",
    supplierOrderTotal: (quantity) => `For ${quantity} pcs`,
    fxConversionNote: "Converted using the exchange rate applied to the import estimate.",
    landedCost: "Total incl. product price and import costs",
    landedEstimate: "estimate",
    landedPending: "waiting for confirmed supplier price",
    delivery: "Delivery",
    supplierRisk: "Supplier risk",
    supplierProfile: "Supplier data",
    supplierRiskDeferred: "A detailed risk check is performed for offers you add for comparison. When the marketplace does not publish verification and business history, JAKOV360 will not repeat the same unverified assessment on every offer.",
    supplierRiskMissing: (items) => `Missing data: ${items}.`,
    supplierIdentity: "company identity",
    supplierPlatformVerification: "platform verification",
    supplierBusinessHistory: "business history",
    supplierPlatformSignalsAvailable: "platform indicators are available",
    incoterm: "Incoterm",
    details: "Analysis details",
    confidence: "Data confidence",
    score: "Preliminary analysis",
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
    liveNotice: "These are new offers from the current search.",
    cachedAfterFailure: "The new search failed. Showing the latest saved results, not new offers.",
    failedSearch: "The search failed",
    failedSearchText: "There are no saved results for this query. JAKOV360 does not invent prices or present unverified offers as real.",
    liveRefresh: "Run live search again",
    selectionOverview: (reviewed, shown) => `JAKOV360 reviewed ${reviewed} candidates and displays all ${shown} available offers.`,
    cachedSelectionOverview: (shown) => `Showing ${shown} saved offers from the previous search. This is not the total candidate count for a new search.`,
    liveSelectionOverview: (found, relevant, shown) => `${found} candidates found → all ${shown} available offers are displayed → ${relevant} currently pass the basic check.`,
    bestChoice: "Best choice",
    preliminaryCandidate: "Best preliminary candidate",
    preliminaryCandidateWarning: "The offer, transport, duties, and taxes are still unverified. This is not a final selection.",
    notARecommendation: "Not a confirmed recommendation",
    needsConfirmation: "Supplier confirmation is required. The product type is not proven yet.",
    disqualifiedProduct: "Does not match the request. Progressive, adjustable, or out-of-range diopters cannot be the best choice.",
    selectionCriteria: "All available offers are shown. Best choice appears only after the purchase price and landed cost are confirmed. Before that, the first candidate can only be preliminary.",
    whySelected: "Why it was selected",
    knownFacts: "What is known",
    equivalentUnverified: (count, score, confidence) => `Same score ${score}/100 and same confidence ${confidence}% (${count}). That is not a confirmed quality difference.`,
    inquiryOrderTitle: "Order for contacting suppliers",
    inquiryBatch: "The priority is not a required sequence. You can select several suppliers and approve the inquiries in the same step. Nothing is sent automatically.",
    inquiryPriority: (position) => `Inquiry priority ${position}`,
    confirmedFinalOffer: "Confirmed final offer",
    lowestUnconfirmedAdvertised: "Lowest advertised price (unconfirmed)",
    inquiryPriceReason: (position, moq) => `Inquiry priority ${position} because of the conditional advertised price in the same currency. Listing MOQ ${moq} does not confirm mixed diopters, an accepted quantity, or a firm price.`,
    excludedFromInquiry: "The source shows an incompatible lens type, so the advertised price is not part of the inquiry order.",
    priceNotComparable: "The advertised prices are not one basis. The order is not by price because comparable evidence is missing.",
    advertisedScoreBonus: (bonus) => bonus > 0
      ? `The conditional advertised price adds +${bonus} to the preliminary analysis. Data confidence stays unchanged.`
      : "No advertised-price addition, because this price is not lower in the comparable set. Data confidence stays unchanged.",
    advertisedNotConfirmedForMixed: (quantity) => quantity
      ? `The advertised price is not confirmed for ${quantity} mixed pieces.`
      : "The advertised price is not confirmed for the requested mixed quantity.",
    conditionalAdvertisedPrice: "Advertised listing price (conditional)",
    reasonProductMatch: "The product matches the requested type or specification.",
    reasonProductLikely: "The offer is relevant, but part of the specification still needs confirmation.",
    variantMixUnconfirmed: "Mixing variants in one order is not confirmed.",
    mixingConfirmed: "Mixing variants in one order is explicitly confirmed.",
    orderTermsUnconfirmed: "The terms for the requested quantity are not confirmed.",
    listedMoq: (quantity) => `Listing MOQ: ${quantity} pieces — does not confirm that the requested quantity can be ordered or that variants can be mixed.`,
    minimumAboveRequest: (requested, minimum) => `Requested: ${requested} pcs · Seller's listing minimum: ${minimum} pcs. The advertised price is not verified for ${requested} pcs. Ask the seller about the requested quantity.`,
    stockMoq: (quantity) => `Stock MOQ: ${quantity}`,
    productionMoq: (quantity) => `Production MOQ: ${quantity}`,
    variantMoq: (quantity) => `MOQ per model, color, or variant: ${quantity}`,
    reasonPriceKnown: "A supplier price is available for comparison.",
    reasonPriceOnRequest: "The price was not retrieved successfully; check the source offer.",
    informationalPrice: "Advertised price. Not confirmed for the requested quantity and not a confirmed procurement cost.",
    pageTierNote: "Price from the quantity tier published on the product page. Not a supplier quotation for this order.",
    publishedTierPrice: "Published tier price",
    writtenQuotePrice: "Written supplier quotation",
    quantityPriceUnconfirmed: (quantity) => quantity
      ? `Price for ${quantity} pieces is not confirmed`
      : "Price for the requested quantity is not confirmed",
    advertisedPriceLabel: "Advertised price",
    advertisedRangeNote: "This is the advertised listing range, not a firm quote for the requested quantity.",
    advertisedNotForQuantity: "Not confirmed for the requested quantity.",
    advertisedAppliesFrom: (quantity) => `Applies only from ${quantity} pieces.`,
    reasonDataConfidence: "The available data has good confidence.",
    unknown: "unknown",
    priceOnRequest: "Price not retrieved",
    variants: "Variants",
    type: "Type",
    quantityPrices: "Quantity prices",
    pieces: "pcs",
    limitReachedAction: "View Plus/Pro or Full Import Analysis for €1.99",
    risk: { LOW: "low risk", MEDIUM: "medium risk", HIGH: "high risk", UNKNOWN: "cannot be assessed" },
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

function formatSupplierOrderTotal(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSupplierPriceWithEuro(
  value: number,
  currency: string,
  locale: Locale,
  fxSnapshot: FxSnapshot | null,
) {
  const original = formatSupplierPrice(value, currency, locale);
  if (currency.toUpperCase() === "EUR" || !fxSnapshot) return original;
  const euroValue = convertToEur(value, currency, fxSnapshot);
  return euroValue === null ? original : `${original} ≈ ${formatMoney(euroValue, locale)}`;
}

export function formatSupplierOrderTotalWithEuro(
  value: number,
  currency: string,
  locale: Locale,
  fxSnapshot: FxSnapshot | null,
) {
  const original = formatSupplierOrderTotal(value, currency, locale);
  if (currency.toUpperCase() === "EUR" || !fxSnapshot) return original;
  const euroValue = convertToEur(value, currency, fxSnapshot);
  return euroValue === null
    ? original
    : `${original} ≈ ${formatSupplierOrderTotal(euroValue, "EUR", locale)}`;
}

function formatQuantity(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

function advertisedPriceNote(
  presentation: SupplierOfferPricePresentation,
  text: Copy,
  locale: Locale,
  fxSnapshot: FxSnapshot | null,
) {
  if (presentation.advertisedPrice === null || presentation.advertisedCurrency === null) return null;
  const low = formatSupplierPriceWithEuro(
    presentation.advertisedPrice,
    presentation.advertisedCurrency,
    locale,
    fxSnapshot,
  );
  const high = presentation.advertisedPriceHigh === null
    ? null
    : formatSupplierPriceWithEuro(
        presentation.advertisedPriceHigh,
        presentation.advertisedCurrency,
        locale,
        fxSnapshot,
      );
  const amount = high ? `${low}–${high}` : low;
  const threshold = high
    ? text.advertisedRangeNote
    : presentation.advertisedAppliesFromQuantity === null
      ? text.advertisedNotForQuantity
      : text.advertisedAppliesFrom(formatQuantity(presentation.advertisedAppliesFromQuantity, locale));
  return `${text.advertisedPriceLabel}: ${amount}. ${threshold}`;
}

export function formatDeliveryTimeDays(value: string | number, locale: Locale) {
  const display = String(value).trim().replace(/\s*-\s*/g, "–");
  if (locale === "sr") return `${display} ${display === "1" ? "dan" : "dana"}`;
  if (locale === "de") return `${display} ${display === "1" ? "Tag" : "Tage"}`;
  return `${display} ${display === "1" ? "day" : "days"}`;
}

export type SupplierRiskGap = "IDENTITY" | "PLATFORM_VERIFICATION" | "BUSINESS_HISTORY";

export function supplierRiskGapKeys(
  supplierName: string,
  missingData: readonly string[] | null | undefined,
  profile?: SupplierOfferMarketplaceSupplierProfile | null,
): SupplierRiskGap[] {
  const gaps: SupplierRiskGap[] = [];
  if (/\b(?:unspecified|unknown|not specified|unidentified)\b|\bseller on alibaba\b/i.test(supplierName)) {
    gaps.push("IDENTITY");
  }
  if (profile?.verified !== true && (!missingData || missingData.includes("SUPPLIER_VERIFICATION"))) {
    gaps.push("PLATFORM_VERIFICATION");
  }
  const hasBusinessHistory = profile?.rating !== null && profile?.rating !== undefined ||
    profile?.onTimeDeliveryPercent !== null && profile?.onTimeDeliveryPercent !== undefined ||
    profile?.yearsOnPlatform !== null && profile?.yearsOnPlatform !== undefined;
  if (!hasBusinessHistory && (!missingData || missingData.includes("SUPPLIER_RISK_DATA"))) {
    gaps.push("BUSINESS_HISTORY");
  }
  return gaps;
}

function supplierPlatformProfileSummary(
  profile: SupplierOfferMarketplaceSupplierProfile | null | undefined,
  locale: Locale,
) {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.verified === true) {
    parts.push(locale === "sr" ? "verifikovan na platformi" : locale === "de" ? "auf der Plattform verifiziert" : "platform verified");
  }
  if (typeof profile.rating === "number") {
    const rating = profile.rating.toLocaleString(numberLocale(locale), { maximumFractionDigits: 1 });
    parts.push(locale === "sr" ? `ocena ${rating}/5` : locale === "de" ? `Bewertung ${rating}/5` : `rating ${rating}/5`);
  }
  if (typeof profile.reviewCount === "number") {
    parts.push(locale === "sr" ? `${formatQuantity(profile.reviewCount, locale)} ocena` : locale === "de" ? `${formatQuantity(profile.reviewCount, locale)} Bewertungen` : `${formatQuantity(profile.reviewCount, locale)} reviews`);
  }
  if (typeof profile.responseTimeHours === "number") {
    parts.push(locale === "sr" ? `odgovor ≤ ${profile.responseTimeHours} h` : locale === "de" ? `Antwort ≤ ${profile.responseTimeHours} Std.` : `response ≤ ${profile.responseTimeHours} h`);
  }
  if (typeof profile.onTimeDeliveryPercent === "number") {
    parts.push(locale === "sr" ? `isporuka na vreme ≥ ${profile.onTimeDeliveryPercent}%` : locale === "de" ? `pünktliche Lieferung ≥ ${profile.onTimeDeliveryPercent}%` : `on-time delivery ≥ ${profile.onTimeDeliveryPercent}%`);
  }
  if (typeof profile.yearsOnPlatform === "number") {
    parts.push(locale === "sr" ? `${profile.yearsOnPlatform} god. na platformi` : locale === "de" ? `${profile.yearsOnPlatform} J. auf der Plattform` : `${profile.yearsOnPlatform} years on platform`);
  }
  return parts.join(" · ");
}

function isRecoverableMarketplaceProductUrl(productUrl: string) {
  try {
    const host = new URL(productUrl).hostname.toLowerCase();
    return host === "alibaba.com" || host.endsWith(".alibaba.com") ||
      host === "made-in-china.com" || host.endsWith(".made-in-china.com");
  } catch {
    return false;
  }
}

export function mergeRecoveredSupplierPreview(
  result: SupplierOfferSearchResult,
  preview: SupplierOfferUrlPreview,
) {
  const authoritative = !preview.isPartial && !preview.titleFromSlug;
  const previewHasPrice = authoritative && preview.price !== null && preview.currency !== null;
  const recoveredImage = isLikelyProductImageUrl(preview.imageUrl)
    ? preview.imageUrl
    : null;
  const currentImage = isLikelyProductImageUrl(result.imageUrl)
    ? result.imageUrl
    : null;

  return {
    ...result,
    // Only a complete exact product page may introduce or correct a price.
    // Partial and slug-only previews stay visible as leads, without a price
    // that was not read from the full offer.
    price: previewHasPrice ? preview.price : result.price,
    currency: previewHasPrice ? preview.currency : result.currency,
    ...(previewHasPrice
      ? { priceEvidence: "PRODUCT_PAGE" as const }
      : result.priceEvidence
        ? { priceEvidence: result.priceEvidence }
        : {}),
    // The background image/price preview is NOT a historical MOQ
    // reconciliation. Keep the saved value until a deliberate, exact-URL
    // source check supplies separately labeled evidence.
    minimumOrderQuantity: result.minimumOrderQuantity,
    incoterm: preview.incoterm !== null && !preview.isPartial
      ? preview.incoterm
      : result.incoterm ?? preview.incoterm,
    imageUrl: recoveredImage ?? currentImage,
    marketplaceDetails: authoritative
      ? preview.details ?? result.marketplaceDetails ?? null
      : result.marketplaceDetails ?? null,
  } satisfies SupplierOfferSearchResult;
}

function selectionReasons(
  result: SupplierOfferSearchResult,
  analysis: TajaCandidateAnalysisWithProductForm | undefined,
  quantity: number | null,
  text: Copy,
  queries: readonly string[],
) {
  const reasons: string[] = [];
  const constraint = evaluateExplicitProductConstraintsForQueries(queries, result);

  if (constraint.status === "DISQUALIFIED") {
    reasons.push(text.disqualifiedProduct);
  } else if (constraint.status === "NEEDS_CONFIRMATION") {
    reasons.push(text.needsConfirmation);
  } else if (allowGenericProductMatchClaim({
    requirementStatus: analysis?.requirementMatch.status,
    productFormStatus: analysis?.productForm.matchStatus,
    requestedCompleteSystem: analysis?.productForm.requestedCompleteSystem ?? false,
    constraintStatus: constraint.status,
  })) {
    reasons.push(text.reasonProductMatch);
  } else if (
    analysis?.productForm.matchStatus === "UNCLEAR" ||
    analysis?.requirementMatch.status === "PARTIAL"
  ) {
    reasons.push(text.reasonProductLikely);
  }

  const pricePresentation = presentSupplierOfferPrice(result, quantity);
  if (pricePresentation.supplierOrderQuote) reasons.push(text.writtenQuotePrice);
  else if (pricePresentation.kind === "PUBLISHED_TIER") reasons.push(text.pageTierNote);
  else if (pricePresentation.kind === "ADVERTISED_ONLY") reasons.push(text.informationalPrice);
  else reasons.push(text.reasonPriceOnRequest);

  if (analysis && analysis.confidenceScore >= 70) {
    reasons.push(text.reasonDataConfidence);
  }

  return reasons.slice(0, 3);
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
  const { locale, t } = useI18n();
  const text = copy[locale];
  const router = useRouter();
  const initialClassification = initialOutcome
    ? classifySupplierSearchOutcome({
        resultOrigin: initialOutcome.resultOrigin,
        liveProviderFailed: initialOutcome.liveProviderFailed ?? false,
        returnedFromCache: initialOutcome.returnedFromCache ?? initialOutcome.resultOrigin === "cache",
        resultCount: initialOutcome.results.length,
        failureCode: initialOutcome.failureCode,
      })
    : null;
  const [results, setResults] = useState<SupplierOfferSearchResult[] | null>(initialOutcome?.results ?? null);
  const [sourceMoqByUrl, setSourceMoqByUrl] = useState<Record<string, SourceMoqEvidence>>({});
  const [analyses, setAnalyses] = useState<TajaCandidateAnalysisWithProductForm[]>(initialOutcome?.candidateAnalyses ?? []);
  const [origin, setOrigin] = useState<ResultOrigin | null>(initialOutcome?.resultOrigin ?? null);
  const [disposition, setDisposition] = useState<SupplierSearchDisposition | null>(
    initialClassification?.searchDisposition ?? null,
  );
  const [failureCode, setFailureCode] = useState<SupplierSearchFailureCode | null>(
    initialClassification?.failureCode ?? null,
  );
  const [reviewedCount, setReviewedCount] = useState(
    initialOutcome?.unfilteredResultCount ?? initialOutcome?.results.length ?? 0,
  );
  const [searchSummary, setSearchSummary] = useState<SupplierOfferSearchSummary | null>(
    initialOutcome?.summary ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [selectingUrl, setSelectingUrl] = useState<string | null>(null);
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);
  const [openedConfirmationUrls, setOpenedConfirmationUrls] = useState<string[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null);
  const automaticSearchStarted = useRef(false);
  const recoveryAttemptedUrls = useRef(new Set<string>());

  const runSearch = useCallback(async () => {
    if (!quantity || !targetCountry) return;
    setLoading(true);
    setError("");
    setLimitReached(false);
    setSourceMoqByUrl({});
    recoveryAttemptedUrls.current.clear();
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
        liveProviderFailed?: boolean;
        returnedFromCache?: boolean;
        failureCode?: SupplierSearchFailureCode | null;
        unfilteredResultCount?: number;
        summary?: SupplierOfferSearchSummary;
        code?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        if (payload?.code === "SEARCH_LIMIT_REACHED") setLimitReached(true);
        throw new Error(payload?.error || text.failedSearchText);
      }
      const nextResults = payload?.results ?? [];
      const classification = classifySupplierSearchOutcome({
        resultOrigin: payload?.resultOrigin ?? null,
        liveProviderFailed: Boolean(payload?.liveProviderFailed),
        returnedFromCache: Boolean(payload?.returnedFromCache),
        resultCount: nextResults.length,
        failureCode: payload?.failureCode,
      });
      setResults(nextResults);
      setAnalyses(payload?.candidateAnalyses ?? []);
      setOrigin(payload?.resultOrigin ?? null);
      setDisposition(classification.searchDisposition);
      setFailureCode(classification.failureCode);
      setReviewedCount(payload?.unfilteredResultCount ?? nextResults.length);
      setSearchSummary(classification.searchDisposition === "live" ? payload?.summary ?? null : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failedSearchText);
      setResults([]);
      setAnalyses([]);
      setOrigin(null);
      setDisposition("failed");
      setFailureCode("provider_error");
      setReviewedCount(0);
      setSearchSummary(null);
    } finally {
      setLoading(false);
    }
  }, [productName, projectId, quantity, targetCountry, text.failedSearchText]);

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

  useEffect(() => {
    if (!results?.length) return;
    const candidates = results
      .filter((result) =>
        isRecoverableMarketplaceProductUrl(result.productUrl) &&
        !recoveryAttemptedUrls.current.has(result.productUrl) &&
        (
          !isLikelyProductImageUrl(result.imageUrl) ||
          result.price === null ||
          !result.marketplaceDetails?.priceTiers.length
        )
      )
      .slice(0, 10);
    if (candidates.length === 0) return;
    candidates.forEach((result) => recoveryAttemptedUrls.current.add(result.productUrl));

    const controller = new AbortController();
    void Promise.all(candidates.map(async (result) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(`/api/projects/${projectId}/supplier-search/url-preview`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ productUrl: result.productUrl }),
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => null) as {
            preview?: SupplierOfferUrlPreview;
          } | null;
          if (response.ok && payload?.preview) {
            return { productUrl: result.productUrl, preview: payload.preview };
          }
          if (![502, 504].includes(response.status)) return null;
        } catch {
          if (controller.signal.aborted) return null;
        }
      }
      return null;
    })).then((recovered) => {
      if (controller.signal.aborted || recovered.every((item) => item === null)) return;
      const previewByUrl = new Map(
        recovered.flatMap((item) => item ? [[item.productUrl, item.preview] as const] : []),
      );
      setResults((current) => current?.map((result) => {
        const preview = previewByUrl.get(result.productUrl);
        return preview ? mergeRecoveredSupplierPreview(result, preview) : result;
      }) ?? current);
    });

    return () => controller.abort();
  }, [projectId, results]);

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
  const constraintQueries = [
    productName,
    ...(results ?? []).flatMap((result) => result.provenance?.originalQuery ? [result.provenance.originalQuery] : []),
  ];
  const visible = (results ?? [])
    .map((savedResult, index) => {
      // Only a read-only session overlay is changed; saved search history
      // and the provider record remain immutable.
      const evidence = sourceMoqByUrl[savedResult.productUrl];
      const result = resultWithSourceMoq(savedResult, evidence);
      const sourceVerified = evidence?.status === "MATCHED" || evidence?.status === "DIFFERENT";
      const suitability = evaluateExplicitProductConstraintsForQueries(constraintQueries, result);
      const presentation = presentSupplierOfferPrice(result, quantity);
      return {
        result,
        savedResult,
        index,
        analysis: analysisByUrl.get(result.productUrl),
        suitability,
        inquiryCandidate: {
          id: result.productUrl,
          suitability: suitability.status,
          currency: presentation.advertisedCurrency,
          // Cached MOQ has not been reconciled with the exact source page.
          // Never give its teaser a buyer-quantity +5 / priority until checked.
          advertisedPrice: origin === "cache" && !sourceVerified
            ? null
            : presentation.advertisedPrice,
          listedMoq: result.minimumOrderQuantity,
          confirmedPurchasePrice: presentation.supplierOrderQuote || presentation.kind === "PUBLISHED_TIER",
        },
      };
    });
  const inquiry = inquiryContactPriority(visible.map((item) => item.inquiryCandidate), quantity);
  const inquiryPosition = new Map(inquiry.orderedIds.map((id, index) => [id, index]));
  visible.sort((left, right) =>
    (inquiryPosition.get(left.result.productUrl) ?? left.index) -
      (inquiryPosition.get(right.result.productUrl) ?? right.index),
  );
  const presentedScores = new Map(preliminaryAdvertisedScorePresentation(
    visible.flatMap(({ analysis, inquiryCandidate }) => (
      analysis ? [{ ...inquiryCandidate, baseScore: analysis.overallScore }] : []
    )),
    quantity,
  ).map((score) => [score.id, score]));
  const unverifiedTies = unverifiedPresentationTies(visible.flatMap(({ result, analysis, suitability }) => (
    analysis
      ? [{
          id: result.productUrl,
          overallScore: presentedScores.get(result.productUrl)?.preliminaryDisplayedScore ?? analysis.overallScore,
          confidenceScore: analysis.confidenceScore,
          finalEligible: analysis.finalEligible,
          suitability: suitability.status,
        }]
      : []
  )));
  const hasDeferredSupplierRisk = visible.some(({ result, analysis }) =>
    (!analysis || analysis.supplierRiskLevel === "UNKNOWN") &&
    !supplierPlatformProfileSummary(result.marketplaceDetails?.supplierProfile, locale)
  );
  const awaitingSearch = results === null && !loading;

  return (
    <section className={`dashboard-card supplier-search${awaitingSearch ? " supplier-search-awaiting" : ""}`}>
      <header className="section-header">
        <div>
          <h2>{text.title}</h2>
          <p>{visible.length > 0 ? text.description : text.emptyDescription}</p>
        </div>
      </header>

      {loading && <p className="muted-text" role="status">{text.searching}</p>}
      {disposition === "live" && results && results.length > 0 && !loading && (
        <p className="muted-text" role="status">{text.liveNotice}</p>
      )}
      {disposition === "cache" && !loading && (
        <div className="cached-result-notice" role="status">
          <p className="muted-text">{failureCode ? text.cachedAfterFailure : text.cached}</p>
          <button className="secondary-button" onClick={() => void runSearch()} type="button">
            {text.liveRefresh}
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {error && !loading && results?.length === 0 && !limitReached && (
        <button className="secondary-button" onClick={() => void runSearch()} type="button">{text.retry}</button>
      )}
      {limitReached && (
        <p>
          <a
            className="primary-link"
            href={`/billing?projectId=${encodeURIComponent(projectId)}`}
          >
            {text.limitReachedAction}
          </a>
        </p>
      )}

      {results === null && !loading && (
        <button className="primary-button" onClick={() => void runSearch()} type="button">{text.search}</button>
      )}

      {results?.length === 0 && !loading && !error && disposition === "failed" && failureCode !== "no_verified_offers" && (
        <div className="empty-state">
          <h3>{text.failedSearch}</h3>
          <p>{text.failedSearchText}</p>
          {!limitReached && (
            <button className="secondary-button" onClick={() => void runSearch()} type="button">{text.retry}</button>
          )}
        </div>
      )}

      {results?.length === 0 && !loading && !error && (disposition !== "failed" || failureCode === "no_verified_offers") && (
        <div className="empty-state">
          <h3>{text.noResults}</h3>
          <p>{text.noResultsText}</p>
          {!limitReached && (
            <button className="secondary-button" onClick={() => void runSearch()} type="button">{text.retry}</button>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <>
          <section className="supplier-selection-summary" aria-label={text.whySelected}>
            <strong>
              {origin === "cache"
                ? text.cachedSelectionOverview(visible.length)
                : searchSummary
                  ? text.liveSelectionOverview(
                      searchSummary.parsedResults,
                      searchSummary.relevantCandidates,
                      visible.length,
                    )
                  : text.selectionOverview(Math.max(reviewedCount, visible.length), visible.length)}
            </strong>
            <p>{text.selectionCriteria}</p>
            <p className="supplier-risk-notice">{text.inquiryOrderTitle}. {text.inquiryBatch}</p>
            {!inquiry.priceUsed && visible.length > 1 && (
              <p className="supplier-risk-notice">{text.priceNotComparable}</p>
            )}
            {unverifiedTies.map((tie) => (
              <p className="supplier-risk-notice" key={`${tie.suitability}-${tie.score}-${tie.confidence}`}>
                {text.equivalentUnverified(tie.ids.length, tie.score, tie.confidence)}
              </p>
            ))}
            {hasDeferredSupplierRisk && (
              <p className="supplier-risk-notice">{text.supplierRiskDeferred}</p>
            )}
          </section>
          <div className="search-result-list">
          {visible.map(({ result, savedResult, analysis, suitability }, index) => {
            const decision = simpleDecision(analysis);
            const pricePresentation = presentSupplierOfferPrice(result, quantity);
            const publishedTier = pricePresentation.kind === "PUBLISHED_TIER";
            const effectiveResult = publishedTier
              ? {
                  ...supplierOfferForQuantity(result, quantity),
                  advertisedPrice: pricePresentation.advertisedPrice,
                  advertisedCurrency: pricePresentation.advertisedCurrency,
                  advertisedPriceHigh: pricePresentation.advertisedPriceHigh,
                }
              : {
                  ...result,
                  price: null,
                  currency: null,
                  advertisedPrice: pricePresentation.advertisedPrice,
                  advertisedCurrency: pricePresentation.advertisedCurrency,
                  advertisedPriceHigh: pricePresentation.advertisedPriceHigh,
                };
            const priceSnapshots = quantityPriceSnapshots(result, quantity);
            const priceTierSnapshots = supplierPriceTierSnapshots(result);
            const variantFacts = supplierOfferVariantFacts(result);
            const orderTerms = presentSupplierOrderTerms({
              requestedQuantity: quantity ?? 0,
              variantMixRequested: variantFacts.groups.length > 0,
              mixingExplicitlyConfirmed: null,
              conditions: [],
            });
            const supplierPlatformSummary = supplierPlatformProfileSummary(
              result.marketplaceDetails?.supplierProfile,
              locale,
            );
            const liveEstimate = quantity && targetCountry && publishedTier
              ? estimateTajaPreliminaryLandedCost({
                  result,
                  quantity,
                  targetCountry,
                  targetMarginPercent: 0,
                  fxSnapshot: pricePresentation.quantityCurrency === "EUR" ? null : fxSnapshot,
                })
              : null;
            const deliveryEstimate = publishedTier
              ? (liveEstimate ?? analysis?.preliminaryCostEstimate ?? null)
              : null;
            const selecting = selectingUrl === result.productUrl;
            const selected = selectedUrls.includes(result.productUrl);
            const confirmationOpen = confirmationUrl === result.productUrl;
            const confirmationMounted = openedConfirmationUrls.includes(result.productUrl);
            const confirmationText = supplierConfirmationCopy(locale);
            const reasons = selectionReasons(result, analysis, quantity, text, constraintQueries);
            const inquiryRank = inquiry.priceUsed ? inquiry.priorityById[result.productUrl] : undefined;
            const presentedScore = presentedScores.get(result.productUrl);
            const displayedScore = presentedScore?.preliminaryDisplayedScore ?? analysis?.overallScore;
            const lowestAdvertised = inquiry.lowestAdvertisedId === result.productUrl;
            const showConfirmedFinal = analysis &&
              sourceMoqByUrl[result.productUrl]?.status !== "DIFFERENT"
              ? canPresentBestChoice({
                  status: suitability.status,
                  confidenceScore: analysis.confidenceScore,
                  finalEligible: analysis.finalEligible,
                })
              : false;
            const showAdvertisedPrice = pricePresentation.advertisedPrice !== null &&
              pricePresentation.advertisedCurrency !== null &&
              (
                !publishedTier ||
                pricePresentation.advertisedPrice !== pricePresentation.quantityUnitPrice
              );
            return (
              <article className={`search-result-card${showConfirmedFinal ? " search-result-card-best" : ""}`} key={`${result.source}-${result.productUrl}`}>
                <SearchResultImage src={result.imageUrl} title={t(result.title)} />
                <div>
                  <p className="eyebrow">
                    <a
                      className="supplier-source-link"
                      href={result.productUrl}
                      rel="noreferrer"
                      target="_blank"
                      aria-label={`${text.source}: ${t(result.supplierName)}`}
                    >
                      #{index + 1} · {t(result.supplierName)}
                    </a>
                  </p>
                  {showConfirmedFinal && (
                    <>
                      <span className="best-choice-badge">{text.bestChoice}</span>
                      <p className="muted-text">{text.confirmedFinalOffer}</p>
                    </>
                  )}
                  {!showConfirmedFinal && inquiry.priceUsed && inquiryRank && (
                    <span className="best-choice-badge best-choice-badge-pending">{text.inquiryPriority(inquiryRank)}</span>
                  )}
                  {lowestAdvertised && (
                    <p className="warning-text">{text.lowestUnconfirmedAdvertised}</p>
                  )}
                  {suitability.status === "DISQUALIFIED" && (
                    <p className="warning-text">{text.disqualifiedProduct}</p>
                  )}
                  <span className={`provider-status ${decisionClass(decision)}`}>{text.decision[decision]}</span>
                  <h3>{t(result.title)}</h3>
                  <div className="offer-highlights">
                    <span>
                      {pricePresentation.supplierOrderQuote
                        ? text.writtenQuotePrice
                        : publishedTier
                          ? text.publishedTierPrice
                          : pricePresentation.kind === "ADVERTISED_ONLY"
                            ? text.conditionalAdvertisedPrice
                            : text.supplierPrice}
                      {pricePresentation.supplierOrderQuote &&
                      pricePresentation.quantityUnitPrice !== null &&
                      pricePresentation.quantityCurrency ? (
                        <strong>
                          {formatSupplierPriceWithEuro(
                            pricePresentation.quantityUnitPrice,
                            pricePresentation.quantityCurrency,
                            locale,
                            fxSnapshot,
                          )} / {text.pieces}
                        </strong>
                      ) : publishedTier &&
                        pricePresentation.quantityUnitPrice !== null &&
                        pricePresentation.quantityCurrency ? (
                        <strong>
                          {formatSupplierPriceWithEuro(
                            pricePresentation.quantityUnitPrice,
                            pricePresentation.quantityCurrency,
                            locale,
                            fxSnapshot,
                          )} / {text.pieces}
                        </strong>
                      ) : (
                        <>
                          <strong className="supplier-price-unconfirmed">
                            {text.quantityPriceUnconfirmed(quantity ? formatQuantity(quantity, locale) : null)}
                          </strong>
                          {pricePresentation.kind === "UNAVAILABLE" && (
                            <small className="supplier-fx-note">{text.priceOnRequest}</small>
                          )}
                        </>
                      )}
                      {publishedTier && (
                        <small className="supplier-fx-note">{text.pageTierNote}</small>
                      )}
                      {showAdvertisedPrice && (
                        <small className="supplier-fx-note">
                          {advertisedPriceNote(pricePresentation, text, locale, fxSnapshot)}
                        </small>
                      )}
                      {lowestAdvertised && (
                        <small className="supplier-fx-note">{text.lowestUnconfirmedAdvertised}</small>
                      )}
                      {publishedTier &&
                        pricePresentation.quantityUnitPrice !== null &&
                        pricePresentation.quantityCurrency &&
                        quantity && (
                        <small className="supplier-order-total">
                          {text.supplierOrderTotal(formatQuantity(quantity, locale))}:{" "}
                          {formatSupplierOrderTotalWithEuro(
                            pricePresentation.quantityUnitPrice * quantity,
                            pricePresentation.quantityCurrency,
                            locale,
                            fxSnapshot,
                          )}
                        </small>
                      )}
                      {publishedTier &&
                        pricePresentation.quantityUnitPrice !== null &&
                        pricePresentation.quantityCurrency &&
                        pricePresentation.quantityCurrency !== "EUR" &&
                        fxSnapshot &&
                        convertToEur(
                          pricePresentation.quantityUnitPrice,
                          pricePresentation.quantityCurrency,
                          fxSnapshot,
                        ) !== null && (
                          <small className="supplier-fx-note">{text.fxConversionNote}</small>
                        )}
                    </span>
                    <span>
                      {text.landedCost}
                      <strong>{liveEstimate ? `≈ ${formatMoney(liveEstimate.basePerUnitEur, locale)} / ${text.pieces} (${text.landedEstimate})` : text.landedPending}</strong>
                    </span>
                    <span>
                      {text.delivery}
                      <strong>{deliveryEstimate
                        ? formatDeliveryTimeDays(deliveryEstimate.deliveryTimeDays, locale)
                        : text.unknown}</strong>
                    </span>
                    {(analysis && analysis.supplierRiskLevel !== "UNKNOWN" || supplierPlatformSummary) && (
                      <span>
                        {analysis && analysis.supplierRiskLevel !== "UNKNOWN"
                          ? text.supplierRisk
                          : text.supplierProfile}
                        <strong>{analysis && analysis.supplierRiskLevel !== "UNKNOWN"
                          ? text.risk[analysis.supplierRiskLevel]
                          : text.supplierPlatformSignalsAvailable}</strong>
                        {supplierPlatformSummary && (
                          <small className="supplier-risk-detail">{supplierPlatformSummary}</small>
                        )}
                      </span>
                    )}
                  </div>

                  {analysis && displayedScore !== undefined && (
                    <p className="preliminary-analysis-score">
                      {text.score}: {displayedScore}/100 · {text.confidence}: {analysis.confidenceScore}%
                    </p>
                  )}

                  <SourceMoqVerificationPanel
                    projectId={projectId}
                    result={savedResult}
                    cachedResult={origin === "cache"}
                    locale={locale}
                    evidence={sourceMoqByUrl[result.productUrl]}
                    onEvidence={(next) => setSourceMoqByUrl((current) => ({
                      ...current,
                      [result.productUrl]: next,
                    }))}
                  />
                  {!orderTerms.confirmedForRequestedQuantity && (
                    <p className="supplier-terms-warning">{text.orderTermsUnconfirmed}</p>
                  )}
                  {typeof quantity === "number" &&
                    result.minimumOrderQuantity !== null &&
                    result.minimumOrderQuantity > quantity && (
                    <p className="supplier-terms-warning" role="note">
                      {text.minimumAboveRequest(
                        formatQuantity(quantity, locale),
                        formatQuantity(result.minimumOrderQuantity, locale),
                      )}
                    </p>
                  )}
                  {result.minimumOrderQuantity !== null &&
                    (typeof quantity !== "number" || result.minimumOrderQuantity <= quantity) && (
                    <p className="muted-text">
                      {text.listedMoq(formatQuantity(result.minimumOrderQuantity, locale))}
                    </p>
                  )}
                  {(orderTerms.stockMoq !== null ||
                    orderTerms.productionMoq !== null ||
                    orderTerms.variantMoq !== null) && (
                    <p className="muted-text">
                      {orderTerms.stockMoq !== null && text.stockMoq(formatQuantity(orderTerms.stockMoq, locale))}
                      {orderTerms.stockMoq !== null && orderTerms.productionMoq !== null ? " · " : ""}
                      {orderTerms.productionMoq !== null && text.productionMoq(formatQuantity(orderTerms.productionMoq, locale))}
                      {(orderTerms.stockMoq !== null || orderTerms.productionMoq !== null) &&
                      orderTerms.variantMoq !== null
                        ? " · "
                        : ""}
                      {orderTerms.variantMoq !== null && text.variantMoq(formatQuantity(orderTerms.variantMoq, locale))}
                    </p>
                  )}
                  {orderTerms.mixingStatus === "CONFIRMED" ? (
                    <p className="muted-text">{text.mixingConfirmed}</p>
                  ) : variantFacts.groups.length > 0 && orderTerms.mixingStatus === "UNCONFIRMED" ? (
                    <p className="muted-text">{text.variantMixUnconfirmed}</p>
                  ) : null}

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
                    {priceTierSnapshots.length > 0
                      ? priceTierSnapshots.map((tier) => (
                          `${formatQuantity(tier.minQuantity, locale)}${tier.maxQuantity === null
                            ? "+"
                            : `–${formatQuantity(tier.maxQuantity, locale)}`} ${text.pieces}: ${formatSupplierPriceWithEuro(
                              tier.price,
                              tier.currency,
                              locale,
                              fxSnapshot,
                            )} / ${text.pieces}`
                        )).join(" · ")
                      : priceSnapshots.map((snapshot) => (
                          `${formatQuantity(snapshot.quantity, locale)} ${text.pieces}: ${snapshot.price !== null && snapshot.currency
                            ? `${formatSupplierPriceWithEuro(
                                snapshot.price,
                                snapshot.currency,
                                locale,
                                fxSnapshot,
                              )} / ${text.pieces}`
                            : text.unknown}`
                        )).join(" · ")}
                  </p>

                  {(reasons.length > 0 || inquiryRank || suitability.status === "DISQUALIFIED") && (
                    <div className="selection-reasons">
                      <strong>{text.knownFacts}</strong>
                      <ul>
                        {inquiry.priceUsed && inquiryRank && result.minimumOrderQuantity !== null && (
                          <li>{text.inquiryPriceReason(inquiryRank, formatQuantity(result.minimumOrderQuantity, locale))}</li>
                        )}
                        {presentedScore?.priceCompared && (
                          <>
                            <li>{text.advertisedScoreBonus(presentedScore.priceIndicatorBonus)}</li>
                            <li>{text.advertisedNotConfirmedForMixed(quantity === null ? null : formatQuantity(quantity, locale))}</li>
                          </>
                        )}
                        {!inquiry.priceUsed && suitability.status !== "DISQUALIFIED" && (
                          <li>{text.priceNotComparable}</li>
                        )}
                        {suitability.status === "DISQUALIFIED" && <li>{text.excludedFromInquiry}</li>}
                        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    </div>
                  )}

                  <details>
                    <summary>{text.details}</summary>
                    <p>{text.incoterm}: {result.incoterm ?? text.unknown}</p>
                    {liveEstimate && (
                      <p>
                        {text.landedCost}: {formatMoney(liveEstimate.lowPerUnitEur, locale)} – {formatMoney(liveEstimate.highPerUnitEur, locale)} / {text.pieces}
                      </p>
                    )}
                    {analysis && displayedScore !== undefined && (
                      <>
                        <p className="preliminary-analysis-score">{text.score}: {displayedScore}/100 · {text.confidence}: {analysis.confidenceScore}%</p>
                        <p className="muted-text">{analysis.explanation}</p>
                        {analysis.missingData.length > 0 && (
                          <p className="muted-text">{text.missing}: {formatMissingDataLabels(analysis.missingData, locale)}</p>
                        )}
                      </>
                    )}
                    <p><a href={result.productUrl} rel="noreferrer" target="_blank">{text.source}</a></p>
                  </details>
                  {confirmationMounted && (
                    <div hidden={!confirmationOpen}>
                      <SupplierConfirmationPanel
                        locale={locale}
                        productName={productName}
                        projectId={projectId}
                        quantity={quantity}
                        result={result}
                        targetCountry={targetCountry}
                      />
                    </div>
                  )}
                </div>
                <div className="search-result-actions">
                  <button
                    className="secondary-button search-result-compare"
                    disabled={selecting || selected}
                    onClick={() => void selectOffer(effectiveResult)}
                    type="button"
                  >
                    {selected ? text.selected : selecting ? text.selecting : text.select}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setOpenedConfirmationUrls((current) =>
                        current.includes(result.productUrl) ? current : [...current, result.productUrl],
                      );
                      setConfirmationUrl(confirmationOpen ? null : result.productUrl);
                    }}
                    type="button"
                  >
                    {confirmationOpen ? confirmationText.hideConfirmation : confirmationText.requestConfirmation}
                  </button>
                </div>
              </article>
            );
          })}
          </div>
        </>
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
