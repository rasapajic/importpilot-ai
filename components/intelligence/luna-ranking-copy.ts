import type { Locale } from "@/modules/i18n/translations";
import type {
  LunaRankingMissingData,
  LunaRankingReasonCode,
} from "@/modules/intelligence/domain/luna-ranking";

type LunaRankingCopy = {
  title: string;
  description: string;
  confirmed: string;
  needsReview: string;
  notReady: string;
  landedCostPerUnit: string;
  margin: string;
  risk: string;
  recommendation: string;
  noConfirmed: string;
  reasons: Record<LunaRankingReasonCode, string>;
  missing: Record<LunaRankingMissingData, string>;
};

const copy: Record<Locale, LunaRankingCopy> = {
  sr: {
    title: "Luna rangiranje",
    description: "Luna rangira samo ponude sa potvrđenom stvarnom cenom i završenom analizom. Nepotvrđene i nepotpune ponude prikazane su odvojeno.",
    confirmed: "Potvrđene i rangirane ponude",
    needsReview: "Ponude koje zahtevaju proveru",
    notReady: "Ponude bez dovoljno podataka",
    landedCostPerUnit: "Stvarna cena po komadu",
    margin: "Bruto marža",
    risk: "Rizik dobavljača",
    recommendation: "Preporuka",
    noConfirmed: "Još nema ponuda sa potvrđenom kalkulacijom i završenom analizom.",
    reasons: {
      TOP_CONFIRMED_OFFER: "Najbolja potvrđena kombinacija preporuke, ocene, marže, cene i rizika.",
      CONFIRMED_COST: "Stvarna cena je potvrđena.",
      TARGET_MARGIN_MET: "Procenjena marža dostiže cilj projekta.",
      RECOMMENDED: "Offer Intelligence preporučuje ponudu.",
      LOW_RISK: "Rizik dobavljača je nizak.",
      LOWEST_CONFIRMED_COST: "Najniža potvrđena cena po komadu među uporedivim ponudama.",
      UNCONFIRMED_COST_ASSUMPTIONS: "Kalkulacija postoji, ali transportne, carinske ili poreske pretpostavke još zahtevaju proveru.",
      MISSING_DATA: "Ponuda još nema sve podatke potrebne za rangiranje.",
    },
    missing: {
      CALCULATION: "nedostaje kalkulacija",
      CURRENCY: "nedostaje valuta",
      LANDED_COST: "nedostaje stvarna cena",
      GROSS_MARGIN: "nedostaje marža",
      ASSESSMENT: "nedostaje analiza ponude",
      SUPPLIER_RISK: "nedostaje ocena rizika",
      FX_RATE: "nema referentnog deviznog kursa",
    },
  },
  de: {
    title: "Luna-Rangliste",
    description: "Luna bewertet nur Angebote mit bestätigten Gesamtkosten und abgeschlossener Analyse. Unbestätigte und unvollständige Angebote werden separat angezeigt.",
    confirmed: "Bestätigte und bewertete Angebote",
    needsReview: "Angebote mit Prüfbedarf",
    notReady: "Angebote mit fehlenden Daten",
    landedCostPerUnit: "Tatsächliche Stückkosten",
    margin: "Bruttomarge",
    risk: "Lieferantenrisiko",
    recommendation: "Empfehlung",
    noConfirmed: "Es gibt noch keine Angebote mit bestätigter Kalkulation und abgeschlossener Analyse.",
    reasons: {
      TOP_CONFIRMED_OFFER: "Beste bestätigte Kombination aus Empfehlung, Bewertung, Marge, Kosten und Risiko.",
      CONFIRMED_COST: "Die tatsächlichen Kosten sind bestätigt.",
      TARGET_MARGIN_MET: "Die geschätzte Marge erreicht das Projektziel.",
      RECOMMENDED: "Offer Intelligence empfiehlt dieses Angebot.",
      LOW_RISK: "Das Lieferantenrisiko ist niedrig.",
      LOWEST_CONFIRMED_COST: "Niedrigste bestätigte Stückkosten unter den vergleichbaren Angeboten.",
      UNCONFIRMED_COST_ASSUMPTIONS: "Eine Kalkulation ist vorhanden, aber Transport-, Zoll- oder Steuerannahmen müssen noch geprüft werden.",
      MISSING_DATA: "Für die Rangliste fehlen noch erforderliche Daten.",
    },
    missing: {
      CALCULATION: "Kalkulation fehlt",
      CURRENCY: "Währung fehlt",
      LANDED_COST: "Gesamtkosten fehlen",
      GROSS_MARGIN: "Marge fehlt",
      ASSESSMENT: "Angebotsanalyse fehlt",
      SUPPLIER_RISK: "Risikobewertung fehlt",
      FX_RATE: "Referenzwechselkurs fehlt",
    },
  },
  en: {
    title: "Luna ranking",
    description: "Luna ranks only offers with confirmed landed cost and a completed assessment. Unconfirmed and incomplete offers are shown separately.",
    confirmed: "Confirmed and ranked offers",
    needsReview: "Offers that need review",
    notReady: "Offers missing required data",
    landedCostPerUnit: "True cost per unit",
    margin: "Gross margin",
    risk: "Supplier risk",
    recommendation: "Recommendation",
    noConfirmed: "There are no offers with confirmed cost and completed assessment yet.",
    reasons: {
      TOP_CONFIRMED_OFFER: "Best confirmed combination of recommendation, score, margin, cost and risk.",
      CONFIRMED_COST: "The true cost is confirmed.",
      TARGET_MARGIN_MET: "The estimated margin meets the project target.",
      RECOMMENDED: "Offer Intelligence recommends this offer.",
      LOW_RISK: "Supplier risk is low.",
      LOWEST_CONFIRMED_COST: "Lowest confirmed cost per unit among comparable offers.",
      UNCONFIRMED_COST_ASSUMPTIONS: "A calculation exists, but transport, customs or tax assumptions still need review.",
      MISSING_DATA: "The offer does not yet have all data required for ranking.",
    },
    missing: {
      CALCULATION: "calculation missing",
      CURRENCY: "currency missing",
      LANDED_COST: "landed cost missing",
      GROSS_MARGIN: "margin missing",
      ASSESSMENT: "offer assessment missing",
      SUPPLIER_RISK: "risk assessment missing",
      FX_RATE: "reference FX rate unavailable",
    },
  },
};

export function getLunaRankingCopy(locale: Locale) {
  return copy[locale];
}
