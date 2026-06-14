import { describe, expect, it } from "vitest";

import { translateText, type Locale } from "../../modules/i18n/translations";

const pageStrings = {
  project: [
    "Pretraga ponuda",
    "Pronađite ponude dobavljača i dodajte odabrane rezultate u projekat.",
    "Količina i ciljna zemlja mogu se preuzeti iz projekta ili uneti ručno radi poređenja.",
    "Koristi vrednosti iz projekta",
    "Unesite naziv proizvoda",
    "Pretraži ponude",
    "Nema pronađenih ponuda.",
    "Automatska pretraga trenutno nije dostupna.",
    "Koristite „Uvezi iz linka” ili „Ručno dodaj ponudu”.",
    "Dodaj u projekat",
    "Otvori izvornu ponudu",
    "Uvezi iz linka",
    "Podaci preuzeti",
    "Proverite podatke i potvrdite dodavanje u kupovinu.",
    "Potvrdi i dodaj u kupovinu",
    "Učitaj drugi link",
    "Nije prepoznato",
    "Nije navedeno",
    "Nije naveden",
    "Još nema analize.",
    "Još nema preporuke.",
    "Uvozni dokumenti",
    "Dokumenti nisu dodati",
    "Kalkulator ukupne nabavne cene",
    "Analiza ponude",
    "Asistent za pregovore",
    "Povratne informacije i analitika",
    "Ishod projekta",
    "Ukupna nabavna cena po jedinici",
    "PDV je automatski podešen prema ciljnoj državi.",
    "PDV nije automatski podešen jer ciljna država nije podržana.",
    "Ručno izmeni PDV",
    "Stil pregovora",
    "Predloži poruku",
    "Prvo izaberite opciju „Pregovaraj“ da biste dobili predlog poruke.",
    "Izaberite stil komunikacije sa dobavljačem.",
    "Kopiraj poruku",
    "Izmeni poruku",
    "Pošalji e-mail",
  ],
  dashboard: [
    "Nova pretraga",
    "Ubaci link proizvoda",
    "Vaše aktivne pretrage",
    "Obriši projekat",
    "Obrisati demo projekat i sve povezane podatke?",
    "Analitika korišćenja",
    "Pokazatelji tačnosti preporuka",
    "Svi statusi završetka",
  ],
  newProject: [
    "Naziv proizvoda",
    "npr. PTZ kamera 3MP",
    "Ciljna zemlja",
    "Količina",
    "Ciljna marža (%)",
  ],
  summary: [
    "Pregled projekta",
    "Štampaj / PDF",
    "Ukupna nabavna cena",
    "Finalna preporuka projekta",
  ],
} as const;

const forbiddenByLocale: Record<Locale, RegExp> = {
  sr: /\b(Document|Vault|Landed cost|Project Outcome|Feedback|Analytics|Offer intelligence|Next move|Negotiation Assistant|upload|completion|Break-even)\b/i,
  en: /\b(Uvozni|Dokumenti nisu|Kalkulator ukupne|Analiza ponude|Asistent za pregovore|Povratne informacije|Ishod projekta|Ciljna marža)\b/i,
  de: /\b(Uvozni|Dokumenti nisu|Kalkulator ukupne|Analiza ponude|Asistent za pregovore|Povratne informacije|Ishod projekta|Ciljna marža)\b/i,
};

describe("page locale consistency", () => {
  for (const locale of ["en", "de", "sr"] as const) {
    it(`does not mix visible UI locale on ${locale} pages`, () => {
      for (const strings of Object.values(pageStrings)) {
        const visiblePage = strings.map((text) => translateText(text, locale)).join(" ");
        expect(visiblePage).not.toMatch(forbiddenByLocale[locale]);
      }
    });
  }
});
