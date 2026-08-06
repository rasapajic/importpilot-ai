import { ASSISTANT_DISPLAY_NAME } from "../../modules/assistant/brand";
import type { Locale } from "../../modules/i18n/translations";
import type { LunaSearchWarning } from "../../modules/product-search/domain/luna-search-plan";

type LunaSearchCopy = {
  title: string;
  description: string;
  criteria: string;
  maxUnitPrice: string;
  currency: string;
  maxMoq: string;
  avoidComplexCompliance: string;
  privateLabel: string;
  searching: string;
  startSearch: string;
  preparedQueries: string;
  chineseConfirmationRequired: string;
  filteredResultsPrefix: string;
  fetchedAt: string;
  addToComparison: string;
  addingToComparison: string;
  addedToComparison: string;
  comparisonSelection: (count: number) => string;
  addMoreBeforeContinue: string;
  continueWithSelected: (count: number) => string;
  warnings: Record<LunaSearchWarning, string>;
};

const copy: Record<Locale, LunaSearchCopy> = {
  sr: {
    title: `${ASSISTANT_DISPLAY_NAME} pretraga`,
    description: `${ASSISTANT_DISPLAY_NAME} pretražuje aktuelne stranice dobavljača, proverava izvore i prosleđuje ponude u računicu uvoza.`,
    criteria: `${ASSISTANT_DISPLAY_NAME} kriterijumi`,
    maxUnitPrice: "Maksimalna cena po komadu",
    currency: "Valuta",
    maxMoq: "Maksimalni MOQ",
    avoidComplexCompliance: "Označi kao uslov: izbegavati komplikovanu sertifikaciju",
    privateLabel: "Traži OEM / sopstveni brend",
    searching: `${ASSISTANT_DISPLAY_NAME} pretražuje internet...`,
    startSearch: "Pronađi stvarne ponude",
    preparedQueries: `${ASSISTANT_DISPLAY_NAME} je pripremila pretragu`,
    chineseConfirmationRequired: "Kineski upit zahteva ručnu potvrdu.",
    filteredResultsPrefix: `${ASSISTANT_DISPLAY_NAME} kriterijumi su uklonili`,
    fetchedAt: "Preuzeto",
    addToComparison: "Dodaj u poređenje",
    addingToComparison: "Dodavanje u poređenje...",
    addedToComparison: "Dodato u poređenje",
    comparisonSelection: (count) => `Izabrano za poređenje: ${count}`,
    addMoreBeforeContinue: "Možete dodati još ponuda pre nego što nastavite.",
    continueWithSelected: (count) => `Nastavite sa izabranim ponudama (${count})`,
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "Kineski upit još nije potvrđen. Koristite originalni upit ili ručno unesite kineski izraz.",
      COMPLIANCE_NOT_VERIFIED: "Sertifikacioni rizik je zabeležen kao uslov, ali još nije automatski verifikovan.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "Maksimalna cena se automatski filtrira samo kada je valuta rezultata ista kao zadata valuta.",
      MARGIN_AFTER_LANDED_COST: "Ciljna marža se potvrđuje tek nakon obračuna ukupne nabavne cene.",
    },
  },
  de: {
    title: `${ASSISTANT_DISPLAY_NAME} Suche`,
    description: `${ASSISTANT_DISPLAY_NAME} durchsucht aktuelle Lieferantenseiten, prüft Quellen und übergibt Angebote an die Importkostenrechnung.`,
    criteria: `${ASSISTANT_DISPLAY_NAME}-Kriterien`,
    maxUnitPrice: "Maximaler Stückpreis",
    currency: "Währung",
    maxMoq: "Maximale MOQ",
    avoidComplexCompliance: "Als Bedingung markieren: aufwendige Zertifizierung vermeiden",
    privateLabel: "OEM / Eigenmarke suchen",
    searching: `${ASSISTANT_DISPLAY_NAME} durchsucht das Internet...`,
    startSearch: "Reale Angebote finden",
    preparedQueries: `${ASSISTANT_DISPLAY_NAME} hat die Suche vorbereitet`,
    chineseConfirmationRequired: "Die chinesische Suchanfrage muss manuell bestätigt werden.",
    filteredResultsPrefix: `Durch die ${ASSISTANT_DISPLAY_NAME}-Kriterien entfernt`,
    fetchedAt: "Abgerufen",
    addToComparison: "Zum Vergleich hinzufügen",
    addingToComparison: "Wird zum Vergleich hinzugefügt...",
    addedToComparison: "Zum Vergleich hinzugefügt",
    comparisonSelection: (count) => `Für den Vergleich ausgewählt: ${count}`,
    addMoreBeforeContinue: "Sie können weitere Angebote hinzufügen, bevor Sie fortfahren.",
    continueWithSelected: (count) => `Mit ausgewählten Angeboten fortfahren (${count})`,
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "Die chinesische Suchanfrage ist noch nicht bestätigt. Verwenden Sie die ursprüngliche Anfrage oder geben Sie den chinesischen Begriff manuell ein.",
      COMPLIANCE_NOT_VERIFIED: "Das Zertifizierungsrisiko ist als Bedingung erfasst, wird aber noch nicht automatisch geprüft.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "Der maximale Preis wird nur dann automatisch gefiltert, wenn Ergebnis- und Zielwährung übereinstimmen.",
      MARGIN_AFTER_LANDED_COST: "Die Zielmarge wird erst nach Berechnung der vollständigen Importkosten bestätigt.",
    },
  },
  en: {
    title: `${ASSISTANT_DISPLAY_NAME} Search`,
    description: `${ASSISTANT_DISPLAY_NAME} searches current supplier pages, verifies sources, and passes offers into the import-cost workflow.`,
    criteria: `${ASSISTANT_DISPLAY_NAME} criteria`,
    maxUnitPrice: "Maximum unit price",
    currency: "Currency",
    maxMoq: "Maximum MOQ",
    avoidComplexCompliance: "Mark as a condition: avoid complex certification",
    privateLabel: "Search for OEM / private label",
    searching: `${ASSISTANT_DISPLAY_NAME} is searching the web...`,
    startSearch: "Find real offers",
    preparedQueries: `${ASSISTANT_DISPLAY_NAME} prepared the search`,
    chineseConfirmationRequired: "The Chinese query requires manual confirmation.",
    filteredResultsPrefix: `Removed by ${ASSISTANT_DISPLAY_NAME} criteria`,
    fetchedAt: "Fetched",
    addToComparison: "Add to comparison",
    addingToComparison: "Adding to comparison...",
    addedToComparison: "Added to comparison",
    comparisonSelection: (count) => `Selected for comparison: ${count}`,
    addMoreBeforeContinue: "You can add more offers before continuing.",
    continueWithSelected: (count) => `Continue with selected offers (${count})`,
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "The Chinese query has not been confirmed. Use the original query or enter the Chinese term manually.",
      COMPLIANCE_NOT_VERIFIED: "Certification risk is recorded as a condition, but it is not yet verified automatically.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "The maximum price is filtered automatically only when the result currency matches the selected currency.",
      MARGIN_AFTER_LANDED_COST: "The target margin is confirmed only after the full landed-cost calculation.",
    },
  },
};

export function getLunaSearchCopy(locale: Locale) {
  return copy[locale];
}
