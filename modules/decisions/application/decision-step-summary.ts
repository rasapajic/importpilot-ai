import { translateText, type Locale } from "../../i18n/translations";

const finalDecisionStatuses = new Set([
  "READY_TO_BUY",
  "NEGOTIATE_FIRST",
  "DO_NOT_BUY",
]);

type FinalDecisionStatus = "READY_TO_BUY" | "NEGOTIATE_FIRST" | "DO_NOT_BUY";

type DecisionDisplayCopy = {
  title: string;
  summary: string;
};

const decisionDisplay: Record<FinalDecisionStatus, Record<Locale, DecisionDisplayCopy>> = {
  READY_TO_BUY: {
    sr: { title: "Isplati se", summary: "Nastavi sa proverama" },
    de: { title: "Rentabel", summary: "Prüfungen fortsetzen" },
    en: { title: "Profitable", summary: "Continue the checks" },
  },
  NEGOTIATE_FIRST: {
    sr: { title: "Može se isplatiti", summary: "Traži bolje uslove" },
    de: { title: "Kann rentabel sein", summary: "Bessere Konditionen verhandeln" },
    en: { title: "Can be profitable", summary: "Negotiate better terms" },
  },
  DO_NOT_BUY: {
    sr: { title: "Ne isplati se", summary: "Traži bolju ponudu" },
    de: { title: "Nicht rentabel", summary: "Besseres Angebot suchen" },
    en: { title: "Not profitable", summary: "Find a better offer" },
  },
};

function resolveLocale(locale: Locale | string): Locale {
  return locale === "de" || locale === "sr" ? locale : "en";
}

export function isFinalDecisionStatus(status: string | null | undefined) {
  return Boolean(status && finalDecisionStatuses.has(status));
}

export function getDecisionStepTitle(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isFinalDecisionStatus(status)) {
    return translateText("Da li se isplati?", locale);
  }
  return decisionDisplay[status as FinalDecisionStatus][resolveLocale(locale)].title;
}

export function getDecisionStepSummary(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isFinalDecisionStatus(status)) {
    return translateText("Generate recommendation", locale);
  }
  return decisionDisplay[status as FinalDecisionStatus][resolveLocale(locale)].summary;
}
