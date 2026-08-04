const phraseReplacements: Array<[RegExp, string]> = [
  [/\bpunja[cč]\s+za\s+telefon\b/gi, "phone charger"],
  [/\bpunja[cč]\b/gi, "charger"],
  [/\btelefon\b/gi, "phone"],
  [/\bkamera\b/gi, "camera"],
  [/\bgrejalic(?:a|e)\b/gi, "heater"],
  [/\bsolarni\s+paneli\b/gi, "solar panels"],
  [/\bsolarni\b/gi, "solar"],
  [/\bpaneli\b/gi, "panels"],
  [/\bladeger[aä]t\b/gi, "charger"],
  [/\bhandy\b/gi, "phone"],
  [/\btyp\s*-?\s*c\b/gi, "type c"],
];

function clean(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function focusedProductQuery(value: string) {
  const normalized = clean(value).toLowerCase();
  const carTrunkOrganizer = /\b(?:(?:foldable|folding|collapsible|expandable)\s+)?(?:car|vehicle|automotive)\s+(?:trunk|boot|cargo)\s+(?:storage\s+)?(?:organizer|organiser|box|bag)\b/i;
  if (carTrunkOrganizer.test(normalized)) return "car trunk organizer";
  return null;
}

export function createSupplierSearchQueryVariants(productQuery: string) {
  const original = clean(productQuery);
  const translated = clean(
    phraseReplacements.reduce(
      (current, [pattern, replacement]) => current.replace(pattern, replacement),
      productQuery,
    ),
  );
  const typeCFirst = /\btype c\b/i.test(translated)
    ? clean(`type c ${translated.replace(/\btype c\b/i, "")}`)
    : translated;
  const focused = focusedProductQuery(translated);

  return [...new Set([focused, typeCFirst, translated, original].filter(
    (query): query is string => Boolean(query && query.length >= 2),
  ))].slice(0, 3);
}
