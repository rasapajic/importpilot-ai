import type { Locale } from "@/modules/i18n/translations";

export type RecoverySearchCopy = {
  betterOffers: string;
  activeLimit: (price: string, currency: string) => string;
  noMatchesTitle: string;
  noMatchesDescription: (price: string, currency: string) => string;
};

const copy: Record<Locale, RecoverySearchCopy> = {
  sr: {
    betterOffers: "Pronađi bolje ponude",
    activeLimit: (price, currency) =>
      `Luna traži bolje ponude sa cenom dobavljača do ${price} ${currency}. Limit je preuzet iz analize isplativosti.`,
    noMatchesTitle: "Nema boljih ponuda u zadatom cenovnom okviru.",
    noMatchesDescription: (price, currency) =>
      `Pronađene ponude ne ispunjavaju limit do ${price} ${currency}. Promenite proizvod, povećajte prodajnu cenu ili ponovite pretragu kasnije.`,
  },
  de: {
    betterOffers: "Bessere Angebote finden",
    activeLimit: (price, currency) =>
      `Luna sucht bessere Angebote mit einem Lieferantenpreis bis ${price} ${currency}. Das Limit stammt aus der Rentabilitätsanalyse.`,
    noMatchesTitle: "Keine besseren Angebote innerhalb des Preislimits gefunden.",
    noMatchesDescription: (price, currency) =>
      `Die gefundenen Angebote erfüllen das Limit von höchstens ${price} ${currency} nicht. Produkt wechseln, Verkaufspreis erhöhen oder später erneut suchen.`,
  },
  en: {
    betterOffers: "Find better offers",
    activeLimit: (price, currency) =>
      `Luna is searching for better offers with a supplier price up to ${price} ${currency}. The limit comes from the profitability analysis.`,
    noMatchesTitle: "No better offers were found within the price limit.",
    noMatchesDescription: (price, currency) =>
      `The offers found do not meet the ${price} ${currency} maximum. Change the product, increase the selling price, or search again later.`,
  },
};

export function getRecoverySearchCopy(locale: Locale) {
  return copy[locale];
}

export function getBetterOffersLabel(locale: Locale) {
  return copy[locale].betterOffers;
}
