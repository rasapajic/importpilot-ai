const phraseReplacements: Array<[RegExp, string]> = [
  [/\bvodena\s+magla\b/gi, "misting system"],
  [/\bteras(?:a|u|e|i)\b/gi, "patio"],
  [/\bpump(?:a|om|u|e)\b/gi, "pump"],
  [/\bmlaznic(?:a|e|u|om|ama)\b/gi, "nozzles"],
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

  const nozzleCount = normalized.match(/\b(\d{1,4})\s+nozzles?\b/)?.[1] ?? null;
  if (/\b(?:misting|mist cooling|fogging)\s+system\b/.test(normalized)) {
    return [
      /\b(?:patio|terrace)\b/.test(normalized)
        ? "patio misting system"
        : "outdoor misting system",
      /\bpump\b/.test(normalized) ? "with pump" : null,
      nozzleCount ? `${nozzleCount} nozzles` : null,
    ].filter(Boolean).join(" ");
  }
  return null;
}

export function createSupplierSearchQueryVariants(
  productQuery: string,
  preferredVariants: string[] = [],
) {
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
  const ordered = [
    ...preferredVariants.map(clean),
    focused,
    original,
    translated,
    typeCFirst,
  ];

  return [...new Set(ordered.filter(
    (query): query is string => Boolean(query && query.length >= 2),
  ))].slice(0, 5);
}
