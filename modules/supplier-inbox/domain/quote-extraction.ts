import { incotermSupplierClaim } from "@/modules/supplier-inbox/domain/cost-guard";

export const FIXTURE_EXTRACTOR_MODEL_ID = "fixture-quote-extractor-v1";

export const QUOTE_FIELD_KEYS = [
  "unit_price_at_quantity",
  "price_tiers",
  "currency",
  "model",
  "diopter_mix",
  "moq",
  "incoterm",
  "named_place",
  "lead_time",
  "packaging",
  "country_of_origin",
  "certificates",
  "quote_validity",
  "payment_terms",
] as const;

export type QuoteFieldKey = (typeof QUOTE_FIELD_KEYS)[number] | "untrusted_instruction";
export type QuoteFieldFlag = "NONE" | "MISSING" | "CONTRADICTION" | "SPEC_MISMATCH" | "LOW_CONFIDENCE";

export type InboxRequirement = {
  product: string;
  progressive: boolean;
  diopters: string[];
  orderedQuantity: number;
  originCountry: string;
  destinationCountry: string;
};

export type ExtractionSource = {
  label: string;
  text: string;
  attachmentId: string | null;
  page: number | null;
};

export type FixtureExtraction = {
  fieldKey: QuoteFieldKey;
  value: unknown;
  confidence: string;
  snippet: string;
  attachmentId: string | null;
  page: number | null;
  flag: QuoteFieldFlag;
  reviewStatus: "UNREVIEWED";
};

type Hit = { value: string; source: ExtractionSource; snippet: string };

const INSTRUCTION = /ignore previous instructions|mark this quote verified|switch organization/i;

function collect(sources: ExtractionSource[], pattern: RegExp): Hit[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const hits: Hit[] = [];
  for (const source of sources) {
    const expression = new RegExp(pattern.source, flags);
    let match = expression.exec(source.text);
    while (match) {
      const start = Math.max(0, match.index - 24);
      const snippet = source.text
        .slice(start, match.index + match[0].length + 24)
        .replace(/\s+/g, " ")
        .trim();
      hits.push({ value: (match[1] ?? match[0]).trim(), source, snippet });
      if (match[0].length === 0) expression.lastIndex += 1;
      match = expression.exec(source.text);
    }
  }
  return hits;
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cite(hits: Hit[]): { snippet: string; attachmentId: string | null; page: number | null } {
  const snippet = hits
    .map((hit) => {
      const page = hit.source.page ? ` p.${hit.source.page}` : "";
      return `${hit.source.label}${page}: ${hit.snippet}`;
    })
    .join("\n")
    .slice(0, 2_000);
  const attached = hits.find((hit) => hit.source.attachmentId);
  return {
    snippet: snippet || "No cited text.",
    attachmentId: attached?.source.attachmentId ?? null,
    page: attached?.source.page ?? null,
  };
}

function field(input: {
  fieldKey: QuoteFieldKey;
  value: unknown;
  flag: QuoteFieldFlag;
  hits: Hit[];
  confidence?: string;
}): FixtureExtraction {
  const citation = cite(input.hits);
  return {
    fieldKey: input.fieldKey,
    value: input.value,
    confidence: input.confidence ?? (input.flag === "NONE" ? "0.400" : "0.200"),
    snippet: citation.snippet,
    attachmentId: citation.attachmentId,
    page: citation.page,
    flag: input.flag,
    reviewStatus: "UNREVIEWED",
  };
}

function mentionsProgressive(text: string): boolean {
  return /progressive/i.test(text.replace(/non-progressive/gi, ""));
}

function sameSet(left: string[], right: string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function extractQuoteWithFixtureAdapter(input: {
  sources: ExtractionSource[];
  requirement: InboxRequirement;
  now?: Date;
}): {
  fields: FixtureExtraction[];
  needsClarification: boolean;
  modelId: typeof FIXTURE_EXTRACTOR_MODEL_ID;
} {
  const sources = input.sources;
  const now = input.now ?? new Date();
  const prices = collect(sources, /unit price usd\s+([0-9]+(?:\.[0-9]{1,2})?)/gi);
  const priceQuantities = collect(sources, /unit price usd\s+[0-9.]+?\s+for\s+([0-9]+)\s+pcs/gi);
  const priceAmounts = distinct(prices.map((hit) => hit.value));
  const quantityMismatch = priceQuantities.some((hit) => Number(hit.value) !== input.requirement.orderedQuantity);
  const priceFlag: QuoteFieldFlag =
    prices.length === 0 ? "MISSING" : priceAmounts.length > 1 || quantityMismatch ? "CONTRADICTION" : "NONE";

  const moqs = collect(sources, /\bmoq\s+([0-9]+)/gi);
  const moqAmounts = distinct(moqs.map((hit) => hit.value));
  const moqFlag: QuoteFieldFlag =
    moqs.length === 0
      ? "MISSING"
      : moqAmounts.length > 1 || moqAmounts.some((value) => Number(value) > input.requirement.orderedQuantity)
        ? "CONTRADICTION"
        : "NONE";

  const diopterHits = collect(sources, /(\+\d+\.\d{2})/g);
  const diopters = distinct(diopterHits.map((hit) => hit.value));
  const progressive = sources.some((source) => mentionsProgressive(source.text));
  const diopterFlag: QuoteFieldFlag =
    !input.requirement.progressive && progressive
      ? "SPEC_MISMATCH"
      : diopters.length === 0
        ? "MISSING"
        : sameSet(diopters, input.requirement.diopters)
          ? "NONE"
          : "SPEC_MISMATCH";

  const incotermHits = collect(
    sources,
    /\bincoterm\s+(EXW|FOB|FCA|CIF|CFR|DAP|DDP)\s+([A-Za-z][A-Za-z .'-]{1,40})/gi,
  );
  const incotermTerms = distinct(incotermHits.map((hit) => hit.value.toUpperCase()));
  const namedPlaces = distinct(
    collect(
      sources,
      /\bincoterm\s+(?:EXW|FOB|FCA|CIF|CFR|DAP|DDP)\s+([A-Za-z][A-Za-z .'-]{1,40})/gi,
    ).map((hit) => hit.value.replace(/[.\s]+$/, "")),
  );

  const currencies = distinct(collect(sources, /\bcurrency\s+(USD|EUR|CNY)\b/gi).map((hit) => hit.value.toUpperCase()));
  const models = distinct(collect(sources, /\bmodel\s+([A-Za-z0-9-]+)/gi).map((hit) => hit.value));
  const leadTimes = collect(sources, /\blead time\s+([0-9]+)\s+days/gi);
  const packaging = collect(sources, /^packaging\s+(.+)$/gim);
  const origins = collect(sources, /country of origin\s+([A-Za-z][A-Za-z .'-]{1,40})/gi);
  const certificates = collect(sources, /^certificates\s+(.+)$/gim);
  const validity = collect(sources, /quote validity\s+(\d{4}-\d{2}-\d{2})/gi);
  const payments = collect(sources, /^payment terms\s+(.+)$/gim);
  const tiers = collect(sources, /^price tiers:\s+(.+)$/gim);

  const validityDate = validity[0] ? new Date(`${validity[0].value}T00:00:00.000Z`) : null;
  const validityExpired = Boolean(validityDate && validityDate.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const fields: FixtureExtraction[] = [
    field({
      fieldKey: "unit_price_at_quantity",
      flag: priceFlag,
      hits: prices,
      value:
        priceFlag === "NONE"
          ? {
              amount: priceAmounts[0],
              quantity: input.requirement.orderedQuantity,
              currency: currencies[0] ?? null,
              selected: priceAmounts[0],
              supplierQuoted: true,
              verified: false,
            }
          : { amounts: priceAmounts, selected: null, verified: false },
    }),
    field({
      fieldKey: "price_tiers",
      flag: tiers.length === 0 ? "MISSING" : priceFlag === "CONTRADICTION" ? "CONTRADICTION" : "NONE",
      hits: tiers.length ? tiers : prices,
      value: { tiers: tiers.map((hit) => hit.value), selected: priceFlag === "NONE" ? tiers[0]?.value ?? null : null, verified: false },
    }),
    field({
      fieldKey: "currency",
      flag: currencies.length === 1 ? "NONE" : currencies.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: collect(sources, /\bcurrency\s+(USD|EUR|CNY)\b/gi),
      value: { currency: currencies.length === 1 ? currencies[0] : null, candidates: currencies, verified: false },
    }),
    field({
      fieldKey: "model",
      flag: models.length === 1 ? "NONE" : models.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: collect(sources, /\bmodel\s+([A-Za-z0-9-]+)/gi),
      value: { model: models.length === 1 ? models[0] : null, verified: false },
    }),
    field({
      fieldKey: "diopter_mix",
      flag: diopterFlag,
      hits: diopterHits,
      value: {
        diopters,
        progressiveOffered: progressive,
        requiredProgressive: input.requirement.progressive,
        requiredDiopters: input.requirement.diopters,
        verified: false,
      },
    }),
    field({
      fieldKey: "moq",
      flag: moqFlag,
      hits: moqs,
      value: {
        amounts: moqAmounts.map(Number),
        orderedQuantity: input.requirement.orderedQuantity,
        selected: moqFlag === "NONE" ? Number(moqAmounts[0]) : null,
        verified: false,
      },
    }),
    field({
      fieldKey: "incoterm",
      flag: incotermTerms.length === 1 ? "NONE" : incotermTerms.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: incotermHits,
      value:
        incotermTerms.length === 1
          ? incotermSupplierClaim(incotermTerms[0], namedPlaces[0] ?? null)
          : { candidates: incotermTerms, selected: null, officialDutyRate: null, zeroesDutyLine: false, verified: false },
    }),
    field({
      fieldKey: "named_place",
      flag: namedPlaces.length === 1 ? "NONE" : namedPlaces.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: incotermHits,
      value: { namedPlace: namedPlaces.length === 1 ? namedPlaces[0] : null, verified: false },
    }),
    field({
      fieldKey: "lead_time",
      flag: leadTimes.length === 1 ? "NONE" : leadTimes.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: leadTimes,
      value: { days: leadTimes.length === 1 ? Number(leadTimes[0].value) : null, verified: false },
    }),
    field({
      fieldKey: "packaging",
      flag: packaging.length === 1 ? "NONE" : packaging.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: packaging,
      value: { packaging: packaging.length === 1 ? packaging[0].value.trim() : null, verified: false },
    }),
    field({
      fieldKey: "country_of_origin",
      flag: origins.length === 1 ? "NONE" : origins.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: origins,
      value: { country: origins.length === 1 ? origins[0].value.trim() : null, verified: false },
    }),
    field({
      fieldKey: "certificates",
      flag: certificates.length === 1 ? "NONE" : certificates.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: certificates,
      value: { certificates: certificates.length === 1 ? certificates[0].value.trim() : null, verified: false },
    }),
    field({
      fieldKey: "quote_validity",
      flag: validity.length === 0 ? "MISSING" : validityExpired || validity.length > 1 ? "LOW_CONFIDENCE" : "NONE",
      hits: validity,
      value: {
        date: validity.length === 1 ? validity[0].value : null,
        expired: validityExpired,
        verified: false,
      },
    }),
    field({
      fieldKey: "payment_terms",
      flag: payments.length === 1 ? "NONE" : payments.length === 0 ? "MISSING" : "CONTRADICTION",
      hits: payments,
      value: { paymentTerms: payments.length === 1 ? payments[0].value.trim() : null, verified: false },
    }),
  ];

  const instructionHits = sources.flatMap((source) =>
    INSTRUCTION.test(source.text)
      ? [{ value: "ignored", source, snippet: source.text.split("\n").find((line) => INSTRUCTION.test(line))?.trim() ?? "untrusted instruction" }]
      : [],
  );
  if (instructionHits.length > 0) {
    fields.push(
      field({
        fieldKey: "untrusted_instruction",
        flag: "NONE",
        hits: instructionHits,
        confidence: "0.200",
        value: { ignored: true, applied: false, organizationChanged: false },
      }),
    );
  }

  const needsClarification = fields.some((item) => item.flag !== "NONE");
  return { fields, needsClarification, modelId: FIXTURE_EXTRACTOR_MODEL_ID };
}
