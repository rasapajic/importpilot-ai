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
    sr: "Da — isplativo je",
    de: "Ja — rentabel",
    en: "Yes — profitable",
  },
  NEGOTIATE_FIRST: {
    sr: "Može biti isplativo uz bolje uslove",
    de: "Mit besseren Konditionen rentabel",
    en: "Can be profitable with better terms",
  },
  DO_NOT_BUY: {
    sr: "Ne — trenutno se ne isplati",
    de: "Nein — derzeit nicht rentabel",
    en: "No — not profitable under current terms",
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
