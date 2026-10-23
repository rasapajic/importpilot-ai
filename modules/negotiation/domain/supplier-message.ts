export const SupplierMessageLanguages = {
  EN: "EN",
  ZH: "ZH",
  EN_ZH: "EN_ZH",
} as const;

export type SupplierMessageLanguage =
  (typeof SupplierMessageLanguages)[keyof typeof SupplierMessageLanguages];

const SERBIAN_DESTINATIONS: Record<string, string> = {
  Serbia: "Srbija",
  Austria: "Austrija",
  Germany: "Nemačka",
};

const DIOPTER_PATTERN = /\+\d+(?:\.\d+)?/g;
const INCOTERM_PATTERN = /\b(?:EXW|FOB|FCA|CIF|CFR|DAP|DDP)\b/g;
const CURRENCY_PATTERN = /\b(?:USD|EUR|CNY|RMB)\b|US\$|¥/g;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

export function serbianInteger(value: number) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function buildSerbianSupplierInquiry(input: {
  supplierName: string;
  productName: string;
  model: string | null;
  quantity: number | null;
  destination: string | null;
  readingGlasses: boolean;
  diopters: readonly string[];
  listedMoq: number | null;
  listedIncoterm: string | null;
  publicTier: string | null;
  advertisedPrice: string | null;
}) {
  const quantityText = input.quantity === null
    ? "planiranu količinu"
    : `${serbianInteger(input.quantity)} komada`;
  const destination = input.destination
    ? SERBIAN_DESTINATIONS[input.destination] ?? input.destination
    : null;
  const asks = [
    input.readingGlasses
      ? `Dostupnost dioptrija ${input.diopters.join(", ")} u jednoj mešovitoj narudžbini.`
      : `Dostupnost tačne specifikacije za proizvod ${input.productName}.`,
    input.readingGlasses
      ? `Jediničnu cenu za ${quantityText} u mešovitim dioptrijama. Cena iz javnog oglasa nije pisana ponuda.`
      : `Jediničnu cenu za ${quantityText}. Cena iz javnog oglasa nije pisana ponuda.`,
    input.readingGlasses
      ? "MOQ po dioptriji, po boji i po modelu."
      : "MOQ za narudžbinu i po varijanti.",
    "Da li je ova količina na zalihama ili ide u proizvodnju.",
    "Incoterm i imenovano mesto, rok isporuke, pakovanje i dokumenta za ovu narudžbinu.",
  ];
  const known = [
    `Proizvod: ${input.productName}.`,
    input.model ? `Model: ${input.model}.` : null,
    input.quantity === null ? null : `Količina: ${serbianInteger(input.quantity)} komada.`,
    destination ? `Destinacija: ${destination}.` : null,
    input.publicTier
      ? `Javni količinski razred za ovu količinu: ${input.publicTier}. To nije pisana ponuda.`
      : null,
    input.advertisedPrice,
    input.listedMoq !== null
      ? `MOQ iz oglasa: ${serbianInteger(input.listedMoq)}. Ovo ne potvrđuje narudžbinu.`
      : null,
    input.listedIncoterm
      ? `Incoterm iz oglasa: ${input.listedIncoterm}. Potvrdite ga za ovu narudžbinu.`
      : null,
  ].filter((line): line is string => line !== null);

  return {
    subject: `Upit — molimo potvrdu narudžbine — ${input.productName}`,
    body: [
      `Poštovani tim ${input.supplierName},`,
      "",
      "Upoređujemo dobavljače i tražimo pisanu ponudu. Ovo je zahtev za potvrdu, a ne narudžbina.",
      "",
      ...known,
      "",
      "Molimo potvrdite:",
      ...asks.map((ask) => `- ${ask}`),
      "",
      "Transport, carinu i ostale troškove navedite odvojeno od jedinične cene, osim ako su uključeni u imenovani Incoterm.",
      "",
      "S poštovanjem,",
    ].join("\n"),
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function normalizedNumber(token: string) {
  const compact = token.replace(/\s/g, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) return compact.replace(/[.,]/g, "");
  if (/^\d+[.,]\d{1,4}$/.test(compact)) return compact.replace(",", ".");
  if (/^\d+$/.test(compact)) return compact;
  return null;
}

export function commercialFacts(text: string) {
  return {
    diopters: unique(text.match(DIOPTER_PATTERN) ?? []),
    incoterms: unique(text.match(INCOTERM_PATTERN) ?? []),
    currencies: unique((text.match(CURRENCY_PATTERN) ?? []).map((item) => item.toUpperCase())),
    numbers: unique(
      (text.match(NUMBER_PATTERN) ?? [])
        .map(normalizedNumber)
        .filter((item): item is string => item !== null),
    ),
    mentionsMoq: /\bMOQ\b/.test(text),
  };
}

export function translationPreservesCommercialFacts(
  source: string,
  translation: string,
  input: { literals?: string[]; minimumCopies?: number } = {},
) {
  const copies = input.minimumCopies ?? 1;
  const original = commercialFacts(source);
  const missing = [
    ...original.diopters.filter((item) => countOccurrences(translation, item) < copies),
    ...original.incoterms.filter((item) => countOccurrences(translation, item) < copies),
    ...original.currencies.filter((item) => countOccurrences(translation.toUpperCase(), item) < copies),
    ...original.numbers.filter((item) => numberCount(translation, item) < copies),
    ...(original.mentionsMoq && countOccurrences(translation, "MOQ") < copies ? ["MOQ"] : []),
    ...(input.literals ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && countOccurrences(translation, item) < copies),
  ];
  return { preserved: missing.length === 0, missing: unique(missing) };
}

function countOccurrences(text: string, token: string) {
  if (!token) return 0;
  let count = 0;
  let from = 0;
  while (from <= text.length) {
    const found = text.indexOf(token, from);
    if (found === -1) break;
    count += 1;
    from = found + token.length;
  }
  return count;
}

function numberCount(text: string, expected: string) {
  return (text.match(NUMBER_PATTERN) ?? [])
    .map(normalizedNumber)
    .filter((item) => item === expected)
    .length;
}

export function supplierFollowUpQuestions(input: {
  replySaved: boolean;
  readingGlasses: boolean;
  priceStated: boolean;
  priceCoversQuantity: boolean;
  moqStated: boolean;
  moqTooHigh: boolean;
  mixingStated: boolean;
  incotermStated: boolean;
  leadTimeStated: boolean;
  mentionsSupply: boolean;
}) {
  if (!input.replySaved) return [];
  const questions: string[] = [];
  if (!input.priceStated || !input.priceCoversQuantity) {
    questions.push("Molimo navedite jediničnu cenu tačno za traženu količinu, odvojeno od transporta, carine i ostalih troškova.");
  }
  if (!input.moqStated || input.moqTooHigh) {
    questions.push("Molimo potvrdite MOQ za ovu narudžbinu i recite da li važi po dioptriji, boji i modelu.");
  }
  if (input.readingGlasses && !input.mixingStated) {
    questions.push("Molimo izričito potvrdite da se tražene dioptrije mogu mešati u jednoj narudžbini i za koju količinu ta cena važi.");
  }
  if (!input.incotermStated) {
    questions.push("Molimo potvrdite Incoterm i imenovano mesto za ovu narudžbinu.");
  }
  if (!input.leadTimeStated) {
    questions.push("Molimo navedite rok isporuke u danima za traženu količinu.");
  }
  if (!input.mentionsSupply) {
    questions.push("Molimo navedite da li je tražena količina na zalihama ili ide u proizvodnju.");
  }
  return questions;
}

export function replyMentionsSupply(text: string) {
  return /\b(?:stock|production|warehouse|lager|zaliha|zalihe|proizvodnja|proizvodnju|现货|生产)\b/i.test(text);
}
