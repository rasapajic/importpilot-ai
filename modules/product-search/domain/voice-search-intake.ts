import type { Locale } from "@/modules/i18n/translations";

export type VoiceSearchIntake = {
  product: string | null;
  quantity: number | null;
  targetCountry: "AT" | "DE" | "RS" | null;
};

type Span = {
  start: number;
  end: number;
};

type QuantityMatch = Span & {
  value: number;
};

type CountryMatch = Span & {
  value: VoiceSearchIntake["targetCountry"];
};

function normalizeWord(value: string) {
  const cyrillicToLatin: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z", з: "z",
    и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
    п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u", ф: "f", х: "h", ц: "c",
    ч: "c", џ: "dz", ш: "s",
  };
  return value
    .toLocaleLowerCase()
    .replace(/[а-шђјљњћџ]/g, (letter) => cyrillicToLatin[letter] ?? letter)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

function parseDigits(value: string) {
  const digits = value.replace(/[\s.,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const EN_SMALL: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SR_SMALL: Record<string, number> = {
  jedan: 1, jedna: 1, jedno: 1, dva: 2, dve: 2, tri: 3, cetiri: 4, pet: 5,
  sest: 6, sedam: 7, osam: 8, devet: 9, deset: 10, jedanaest: 11, dvanaest: 12,
  trinaest: 13, cetrnaest: 14, petnaest: 15, sesnaest: 16, sedamnaest: 17,
  osamnaest: 18, devetnaest: 19, dvadeset: 20, trideset: 30, cetrdeset: 40,
  pedeset: 50, sezdeset: 60, sedamdeset: 70, osamdeset: 80, devedeset: 90,
  sto: 100, stotinu: 100, dvesta: 200, trista: 300, cetiristo: 400, petsto: 500,
  seststo: 600, sedamsto: 700, osamsto: 800, devetsto: 900,
};

const DE_SMALL: Record<string, number> = {
  ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, funf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12,
  dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19, zwanzig: 20, dreissig: 30, vierzig: 40,
  funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};

function parseEnglishNumber(tokens: string[]) {
  let total = 0;
  let current = 0;
  for (const raw of tokens) {
    const token = normalizeWord(raw);
    if (token === "and") continue;
    if (token === "hundred") {
      current = Math.max(current, 1) * 100;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(current, 1) * 1000;
      current = 0;
      continue;
    }
    const value = EN_SMALL[token];
    if (!value) return null;
    current += value;
  }
  const result = total + current;
  return result > 0 ? result : null;
}

function parseSerbianNumber(tokens: string[]) {
  let total = 0;
  let current = 0;
  for (const raw of tokens) {
    const token = normalizeWord(raw);
    if (["hiljada", "hiljade", "hiljadu"].includes(token)) {
      total += Math.max(current, 1) * 1000;
      current = 0;
      continue;
    }
    const value = SR_SMALL[token];
    if (!value) return null;
    current += value;
  }
  const result = total + current;
  return result > 0 ? result : null;
}

function parseGermanToken(raw: string): number | null {
  const token = normalizeWord(raw);
  const direct = DE_SMALL[token];
  if (direct) return direct;

  const thousandIndex = token.indexOf("tausend");
  if (thousandIndex >= 0) {
    const left = token.slice(0, thousandIndex) || "ein";
    const right = token.slice(thousandIndex + "tausend".length);
    const thousands = parseGermanToken(left);
    const remainder = right ? parseGermanToken(right) : 0;
    return thousands && remainder !== null ? thousands * 1000 + remainder : null;
  }

  const hundredIndex = token.indexOf("hundert");
  if (hundredIndex >= 0) {
    const left = token.slice(0, hundredIndex) || "ein";
    const right = token.slice(hundredIndex + "hundert".length);
    const hundreds = parseGermanToken(left);
    const remainder = right ? parseGermanToken(right) : 0;
    return hundreds && remainder !== null ? hundreds * 100 + remainder : null;
  }

  const undIndex = token.indexOf("und");
  if (undIndex > 0) {
    const left = DE_SMALL[token.slice(0, undIndex)];
    const right = DE_SMALL[token.slice(undIndex + 3)];
    if (left && left < 10 && right && right >= 20 && right % 10 === 0) return left + right;
  }

  return null;
}

function parseGermanNumber(tokens: string[]) {
  let total = 0;
  for (const token of tokens) {
    const value = parseGermanToken(token);
    if (value === null) return null;
    total += value;
  }
  return total > 0 ? total : null;
}

function parseWordNumber(tokens: string[], locale: Locale) {
  if (locale === "de") return parseGermanNumber(tokens);
  if (locale === "en") return parseEnglishNumber(tokens);
  return parseSerbianNumber(tokens);
}

const QUANTITY_UNIT = /^(?:kom|komada|komad|komade|komadi|pcs|pc|pieces|piece|units|unit|stuck|stueck|stucke|stuecke)$/i;

function quantityFromDigits(text: string): QuantityMatch | null {
  const patterns = [
    /\b(?:koli[cč]ina|quantity|menge)\s*(?:je|is|ist|:|-)?\s*([0-9][0-9\s.,]{0,12})\b/iu,
    /\b([0-9][0-9\s.,]{0,12})\s*(?:kom(?:ada|ad|ade|adi)?|pcs?|pieces?|units?|st(?:ü|u|ue)ck(?:e)?)\b/iu,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match || match.index === undefined) continue;
    const value = parseDigits(match[1] ?? "");
    if (!value) continue;
    return { value, start: match.index, end: match.index + match[0].length };
  }
  return null;
}

function quantityFromWords(text: string, locale: Locale): QuantityMatch | null {
  const tokens = Array.from(text.matchAll(/[\p{L}]+/gu)).map((match) => ({
    word: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  for (let unitIndex = 0; unitIndex < tokens.length; unitIndex += 1) {
    if (!QUANTITY_UNIT.test(normalizeWord(tokens[unitIndex].word))) continue;

    for (let length = Math.min(5, unitIndex); length >= 1; length -= 1) {
      const startIndex = unitIndex - length;
      const numberTokens = tokens.slice(startIndex, unitIndex).map((token) => token.word);
      const value = parseWordNumber(numberTokens, locale);
      if (!value) continue;
      return {
        value,
        start: tokens[startIndex].start,
        end: tokens[unitIndex].end,
      };
    }
  }

  return null;
}

function findQuantity(text: string, locale: Locale) {
  return quantityFromDigits(text) ?? quantityFromWords(text, locale);
}

const COUNTRY_PATTERNS: Array<{
  value: CountryMatch["value"];
  pattern: RegExp;
}> = [
  {
    value: "AT",
    pattern: /\b(?:(?:za|u|destinacija|zemlja|für|fuer|nach|zielland|land|to|for|destination|country)\s*(?::|-)?\s*)?(?:austrij(?:a|u|i|e)|аустриј(?:а|у|и|е)|austria|österreich|oesterreich)\b/iu,
  },
  {
    value: "DE",
    pattern: /\b(?:(?:za|u|destinacija|zemlja|für|fuer|nach|zielland|land|to|for|destination|country)\s*(?::|-)?\s*)?(?:nema[cč]k(?:a|u|oj|e)|немачк(?:а|у|ој|е)|njema[cč]k(?:a|u|oj|e)|deutschland|germany)\b/iu,
  },
  {
    value: "RS",
    pattern: /\b(?:(?:za|u|destinacija|zemlja|für|fuer|nach|zielland|land|to|for|destination|country)\s*(?::|-)?\s*)?(?:srbij(?:a|u|i|e)|србиј(?:а|у|и|е)|serbia|serbien)\b/iu,
  },
];

function findCountry(text: string): CountryMatch | null {
  for (const candidate of COUNTRY_PATTERNS) {
    const match = candidate.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    return {
      value: candidate.value,
      start: match.index,
      end: match.index + match[0].length,
    };
  }
  return null;
}

function removeSpans(text: string, spans: Span[]) {
  let result = text;
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, span.start) + " " + result.slice(span.end);
  }
  return result;
}

function cleanProduct(text: string, locale: Locale) {
  let result = text
    .replace(/[;,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const prefixes: Record<Locale, RegExp[]> = {
    sr: [
      /^(?:tra[zž]im|тражим|treba mi|треба ми|prona[dđ]i(?: mi)?|пронађи(?: ми)?|na[dđ]i(?: mi)?|нађи(?: ми)?|[zž]elim|желим)\s+/iu,
      /^(?:proizvod|производ)\s*(?::|-)\s*/iu,
    ],
    de: [
      /^(?:ich suche|ich brauche|finde mir|suche|ich m[oö]chte)\s+/iu,
      /^(?:produkt)\s*(?::|-)\s*/iu,
    ],
    en: [
      /^(?:i am looking for|i['’]m looking for|looking for|i need|find me|search for|i want)\s+/iu,
      /^(?:product)\s*(?::|-)\s*/iu,
    ],
  };

  for (const pattern of prefixes[locale]) result = result.replace(pattern, "");
  return result.replace(/^[-:,.!?;\s]+|[-:,.!?;\s]+$/g, "").replace(/\s+/g, " ").trim();
}

export function parseVoiceSearchIntake(text: string, locale: Locale): VoiceSearchIntake {
  const trimmed = text.trim();
  if (!trimmed) return { product: null, quantity: null, targetCountry: null };

  const quantity = findQuantity(trimmed, locale);
  const country = findCountry(trimmed);
  const product = cleanProduct(
    removeSpans(trimmed, [quantity, country].filter((value): value is Span => Boolean(value))),
    locale,
  );

  return {
    product: product.length >= 2 ? product : null,
    quantity: quantity?.value ?? null,
    targetCountry: country?.value ?? null,
  };
}
