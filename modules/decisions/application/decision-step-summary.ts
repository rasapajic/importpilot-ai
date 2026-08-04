import { translateText, type Locale } from "../../i18n/translations";

const finalDecisionStatuses = new Set([
  "READY_TO_BUY",
  "NEGOTIATE_FIRST",
  "DO_NOT_BUY",
]);

const decisionSummaries: Record<
  "READY_TO_BUY" | "NEGOTIATE_FIRST" | "DO_NOT_BUY",
  Record<Locale, string>
> = {
  READY_TO_BUY: {
    sr: "Isplati se — nastavite sa proverama",
    de: "Rentabel — Prüfungen fortsetzen",
    en: "Profitable — continue the checks",
  },
  NEGOTIATE_FIRST: {
    sr: "Može se isplatiti — tražite bolje uslove",
    de: "Kann rentabel sein — bessere Konditionen verhandeln",
    en: "Can be profitable — negotiate better terms",
  },
  DO_NOT_BUY: {
    sr: "Ne isplati se — tražite bolju ponudu",
    de: "Nicht rentabel — besseres Angebot suchen",
    en: "Not profitable — find a better offer",
  },
};

export function isFinalDecisionStatus(status: string | null | undefined) {
  return Boolean(status && finalDecisionStatuses.has(status));
}

export function getDecisionStepSummary(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isFinalDecisionStatus(status)) {
    return translateText("Generate recommendation", locale);
  }
  const resolvedLocale: Locale = locale === "de" || locale === "sr" ? locale : "en";
  return decisionSummaries[
    status as "READY_TO_BUY" | "NEGOTIATE_FIRST" | "DO_NOT_BUY"
  ][resolvedLocale];
}
