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

export function groupedEnglishInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function isInternetDomainName(value: string) {
  const host = value.trim().replace(/^https?:\/\//i, "").replace(/[/?#].*$/, "");
  if (!host || /\s/.test(host)) return false;
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host);
}

export function serbianSupplierGreeting(supplierName: string) {
  const name = supplierName.trim();
  if (!name || isInternetDomainName(name)) return "Poštovani,";
  return `Poštovani tim ${name},`;
}

export function englishSupplierGreeting(supplierName: string) {
  const name = supplierName.trim();
  if (!name || isInternetDomainName(name)) return "Dear Supplier,";
  return `Dear ${name} team,`;
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
      `${serbianSupplierGreeting(input.supplierName)}`,
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

const SERBIAN_PIECE_UNIT = /\bkom(?:ad|ada)?\b/i;
const DOMAIN_IN_TEXT = /(?:[a-z0-9-]+\.)+[a-z]{2,}/i;
const QUANTITY_LABEL_BEFORE = /količin\w*\s*:\s*$/i;
const PIECE_UNIT_AFTER = /^\s+kom(?:ad|ada)?\b/i;

function isQuantitySpan(text: string, index: number, raw: string) {
  return QUANTITY_LABEL_BEFORE.test(text.slice(0, index))
    || PIECE_UNIT_AFTER.test(text.slice(index + raw.length));
}

function quantityIntegers(text: string) {
  const values: string[] = [];
  for (const match of text.matchAll(/\d{1,3}(?:[.,]\d{3})+|\d+/g)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (!isQuantitySpan(text, index, raw)) continue;
    const normalized = normalizedNumber(raw);
    if (normalized && /^\d{4,}$/.test(normalized)) values.push(normalized);
  }
  return unique(values);
}

function modelCluster(text: string, index: number, length: number) {
  let start = index;
  let end = index + length;
  const left = text.slice(0, start).match(/((?:[A-Z][A-Za-z0-9-]*\s+)+)$/);
  if (left?.[1]) start -= left[1].length;
  const right = text.slice(end).match(/^((?:\s+[A-Z][A-Za-z0-9-]*)+)/);
  if (right?.[1]) end += right[1].length;
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function preservedMarkings(text: string) {
  const markings = [
    ...text.matchAll(/\b[A-Za-z]+[A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g),
  ].map((match) => match[0]);
  markings.push(...[...text.matchAll(/\bISO\s+\d+\b/gi)].map((match) => match[0]));
  for (const match of text.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    const index = match.index ?? 0;
    if (isQuantitySpan(text, index, match[0])) continue;
    markings.push(modelCluster(text, index, match[0].length));
  }
  return unique(markings);
}

function salutationUsesDomain(text: string) {
  return text.split("\n").slice(0, 4).some((line) => {
    const trimmed = line.trim();
    if (!/^(?:dear|hello|hi|poštovani|您好|尊敬)/i.test(trimmed)) return false;
    return DOMAIN_IN_TEXT.test(trimmed);
  });
}

export function outboundTranslationRendersTargetLanguage(
  source: string,
  translation: string,
  target: SupplierMessageLanguage,
) {
  const problems: string[] = [];
  const sections = target === "EN_ZH" ? translation.split(/\n---\n/) : [translation];
  if (target === "EN_ZH" && (sections.length < 2 || sections.some((section) => !section.trim()))) {
    problems.push("EN_ZH");
  }
  const english = target === "ZH" ? "" : sections[0] ?? "";
  const chinese = target === "ZH" ? translation : target === "EN_ZH" ? sections.slice(1).join("\n---\n") : "";
  const sourceHasPieceUnit = SERBIAN_PIECE_UNIT.test(source);
  const quantities = quantityIntegers(source);
  const markings = preservedMarkings(source);
  const renderedSections = [english, chinese].filter((section) => section.length > 0);

  if (sourceHasPieceUnit && target !== "ZH") {
    if (!/\bpieces?\b/i.test(english)) problems.push("pieces");
    if (SERBIAN_PIECE_UNIT.test(english)) problems.push("komada");
    for (const value of quantities) {
      const grouped = groupedEnglishInteger(value);
      if (!english.includes(grouped)) problems.push(grouped);
    }
  }
  if (sourceHasPieceUnit && target !== "EN") {
    if (!chinese.includes("件")) problems.push("件");
    if (SERBIAN_PIECE_UNIT.test(chinese)) problems.push("komada");
    for (const value of quantities) {
      if (!chinese.includes(groupedEnglishInteger(value)) && !chinese.includes(value)) {
        problems.push(`${value}件`);
      }
    }
  }
  for (const section of renderedSections) {
    for (const marking of markings) {
      if (!section.includes(marking)) problems.push(marking);
    }
  }
  if (salutationUsesDomain(translation)) problems.push("domain-salutation");
  return { complete: problems.length === 0, problems: unique(problems) };
}

export function bilingualSupplierTranslationParts(text: string) {
  const marker = text.indexOf("\n---\n");
  if (marker < 0) return null;
  return {
    english: text.slice(0, marker),
    chinese: text.slice(marker + "\n---\n".length),
  };
}

export function usableInquiryTranslation(input: {
  selectedLanguage: SupplierMessageLanguage;
  savedLanguage: SupplierMessageLanguage | null;
  translatedMessage: string;
  sourceIsCurrent: boolean;
  translationCurrent: boolean;
}) {
  if (!input.sourceIsCurrent || !input.translationCurrent) return null;
  if (!input.savedLanguage || input.selectedLanguage !== input.savedLanguage) return null;
  const text = input.translatedMessage.trim();
  if (!text) return null;
  if (input.selectedLanguage === "EN_ZH") {
    const parts = bilingualSupplierTranslationParts(text);
    if (!parts?.english.trim() || !parts.chinese.trim()) return null;
  }
  return text;
}

export function inquiryMessageForSending(input: {
  selectedLanguage: SupplierMessageLanguage;
  savedLanguage: SupplierMessageLanguage | null;
  translatedMessage: string;
  sourceIsCurrent: boolean;
  translationCurrent: boolean;
  serbianFallback: string;
}) {
  return usableInquiryTranslation(input) ?? input.serbianFallback;
}

export function inquiryTranslationFields(input: {
  selectedLanguage: SupplierMessageLanguage;
  savedLanguage: SupplierMessageLanguage | null;
  translatedMessage: string;
}) {
  if (!input.savedLanguage || input.selectedLanguage !== input.savedLanguage) {
    return { kind: "hidden" } as const;
  }
  const text = input.translatedMessage.trim();
  if (!text) return { kind: "hidden" } as const;
  if (input.selectedLanguage === "EN_ZH") {
    const parts = bilingualSupplierTranslationParts(input.translatedMessage);
    if (!parts?.english.trim() || !parts.chinese.trim()) return { kind: "hidden" } as const;
    return { kind: "bilingual", english: parts.english, chinese: parts.chinese } as const;
  }
  return { kind: "single", language: input.selectedLanguage, text: input.translatedMessage } as const;
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
