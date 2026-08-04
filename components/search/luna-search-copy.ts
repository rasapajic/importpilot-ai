import type { Locale } from "@/modules/i18n/translations";
import type { LunaSearchWarning } from "@/modules/product-search/domain/luna-search-plan";

type LunaSearchCopy = {
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
  warnings: Record<LunaSearchWarning, string>;
};

const copy: Record<Locale, LunaSearchCopy> = {
  sr: {
    description: "Luna priprema upite, pronalazi ponude i prosleđuje ih u postojeću računicu uvoza.",
    criteria: "Luna kriterijumi",
    maxUnitPrice: "Maksimalna cena po komadu",
    currency: "Valuta",
    maxMoq: "Maksimalni MOQ",
    avoidComplexCompliance: "Označi kao uslov: izbegavati komplikovanu sertifikaciju",
    privateLabel: "Traži OEM / sopstveni brend",
    searching: "Luna pretražuje...",
    startSearch: "Pokreni Luna Search",
    preparedQueries: "Luna je pripremila upite",
    chineseConfirmationRequired: "Kineski upit zahteva ručnu potvrdu.",
    filteredResultsPrefix: "Luna kriterijumi su uklonili",
    fetchedAt: "Preuzeto",
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "Kineski upit još nije potvrđen. Koristite originalni upit ili ručno unesite kineski izraz.",
      COMPLIANCE_NOT_VERIFIED: "Sertifikacioni rizik je zabeležen kao uslov, ali u ovom MVP rezu još nije automatski verifikovan.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "Maksimalna cena se automatski filtrira samo kada je valuta rezultata ista kao zadata valuta.",
      MARGIN_AFTER_LANDED_COST: "Ciljna marža se potvrđuje tek nakon obračuna ukupne nabavne cene.",
    },
  },
  de: {
    description: "Luna bereitet Suchanfragen vor, findet Angebote und übergibt sie an die bestehende Importkostenrechnung.",
    criteria: "Luna-Kriterien",
    maxUnitPrice: "Maximaler Stückpreis",
    currency: "Währung",
    maxMoq: "Maximale MOQ",
    avoidComplexCompliance: "Als Bedingung markieren: aufwendige Zertifizierung vermeiden",
    privateLabel: "OEM / Eigenmarke suchen",
    searching: "Luna sucht...",
    startSearch: "Luna Search starten",
    preparedQueries: "Luna hat die Suchanfragen vorbereitet",
    chineseConfirmationRequired: "Die chinesische Suchanfrage muss manuell bestätigt werden.",
    filteredResultsPrefix: "Durch die Luna-Kriterien entfernt",
    fetchedAt: "Abgerufen",
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "Die chinesische Suchanfrage ist noch nicht bestätigt. Verwenden Sie die ursprüngliche Anfrage oder geben Sie den chinesischen Begriff manuell ein.",
      COMPLIANCE_NOT_VERIFIED: "Das Zertifizierungsrisiko ist als Bedingung erfasst, wird in diesem MVP-Schritt aber noch nicht automatisch geprüft.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "Der maximale Preis wird nur dann automatisch gefiltert, wenn Ergebnis- und Zielwährung übereinstimmen.",
      MARGIN_AFTER_LANDED_COST: "Die Zielmarge wird erst nach Berechnung der vollständigen Importkosten bestätigt.",
    },
  },
  en: {
    description: "Luna prepares search queries, finds offers and passes them into the existing import-cost workflow.",
    criteria: "Luna criteria",
    maxUnitPrice: "Maximum unit price",
    currency: "Currency",
    maxMoq: "Maximum MOQ",
    avoidComplexCompliance: "Mark as a condition: avoid complex certification",
    privateLabel: "Search for OEM / private label",
    searching: "Luna is searching...",
    startSearch: "Start Luna Search",
    preparedQueries: "Luna prepared the search queries",
    chineseConfirmationRequired: "The Chinese query requires manual confirmation.",
    filteredResultsPrefix: "Removed by Luna criteria",
    fetchedAt: "Fetched",
    warnings: {
      CHINESE_QUERY_UNCONFIRMED: "The Chinese query has not been confirmed. Use the original query or enter the Chinese term manually.",
      COMPLIANCE_NOT_VERIFIED: "Certification risk is recorded as a condition, but it is not yet verified automatically in this MVP slice.",
      PRICE_FILTER_SAME_CURRENCY_ONLY: "The maximum price is filtered automatically only when the result currency matches the selected currency.",
      MARGIN_AFTER_LANDED_COST: "The target margin is confirmed only after the full landed-cost calculation.",
    },
  },
};

export function getLunaSearchCopy(locale: Locale) {
  return copy[locale];
}
