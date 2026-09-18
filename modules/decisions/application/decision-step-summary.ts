import { translateText, type Locale } from "../../i18n/translations";

const finalDecisionStatuses = new Set([
  "READY_TO_BUY",
  "NEGOTIATE_FIRST",
  "DO_NOT_BUY",
]);

type DecisionStatus =
  | "READY_TO_BUY"
  | "NEGOTIATE_FIRST"
  | "NEED_MORE_OFFERS"
  | "DO_NOT_BUY";

type DecisionDisplayCopy = {
  title: string;
  summary: string;
};

const decisionDisplay: Record<DecisionStatus, Record<Locale, DecisionDisplayCopy>> = {
  READY_TO_BUY: {
    sr: { title: "KUPI", summary: "Ponuda prolazi osnovne provere" },
    de: { title: "BUY", summary: "Das Angebot besteht die Grundprüfungen" },
    en: { title: "BUY", summary: "The offer passes the core checks" },
  },
  NEGOTIATE_FIRST: {
    sr: { title: "PREGOVARAJ", summary: "Traži bolje uslove pre kupovine" },
    de: { title: "NEGOTIATE", summary: "Vor dem Kauf bessere Konditionen verhandeln" },
    en: { title: "NEGOTIATE", summary: "Negotiate better terms before buying" },
  },
  NEED_MORE_OFFERS: {
    sr: { title: "PRATI", summary: "Još nema dovoljno podataka za odluku" },
    de: { title: "WATCH", summary: "Noch nicht genügend Daten für eine Entscheidung" },
    en: { title: "WATCH", summary: "There is not enough data for a decision yet" },
  },
  DO_NOT_BUY: {
    sr: { title: "PRESKOČI", summary: "Odnos cene i rizika nije dovoljno dobar" },
    de: { title: "SKIP", summary: "Preis und Risiko sind nicht attraktiv genug" },
    en: { title: "SKIP", summary: "The price-to-risk tradeoff is not good enough" },
  },
};

function resolveLocale(locale: Locale | string): Locale {
  return locale === "de" || locale === "sr" ? locale : "en";
}

function isDecisionStatus(status: string | null | undefined): status is DecisionStatus {
  return Boolean(status && status in decisionDisplay);
}

export function isFinalDecisionStatus(status: string | null | undefined) {
  return Boolean(status && finalDecisionStatuses.has(status));
}

export function getDecisionStepTitle(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isDecisionStatus(status)) {
    return translateText("Da li se isplati?", locale);
  }
  return decisionDisplay[status][resolveLocale(locale)].title;
}

export function getDecisionStepSummary(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isDecisionStatus(status)) {
    return translateText("Generate recommendation", locale);
  }
  return decisionDisplay[status][resolveLocale(locale)].summary;
}
