import type { AiUsageEvent } from "@/modules/ai-usage/domain/ai-usage";
import {
  SUPPLIER_MESSAGE_PRICING,
  supplierMessageUsageEvent,
} from "@/modules/negotiation/domain/supplier-message-cost";
import type { SupplierMessageLanguage } from "@/modules/negotiation/domain/supplier-message";

export class SupplierMessageTranslationNotConfiguredError extends Error {}

export type SupplierMessageTranslation = {
  text: string;
  usage: AiUsageEvent;
};

export type SupplierMessageTranslator = {
  translate(input: {
    text: string;
    target: SupplierMessageLanguage;
    direction: "outbound" | "reply";
  }): Promise<SupplierMessageTranslation>;
};

type OpenAiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

type OpenAiPayload = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: OpenAiUsage;
  error?: { message?: string };
};

const TARGET_INSTRUCTION: Record<SupplierMessageLanguage, string> = {
  EN: "Write the full message in professional business English. Example of a quantity line: Quantity: 1,000 pieces.",
  ZH: "Write the full message in professional Simplified Chinese. Example of a quantity line: 数量：1,000件.",
  EN_ZH: "Write the full message in professional business English, then a line containing only ---, then the same full message in professional Simplified Chinese. Repeat every price, diopter, MOQ, model, Incoterm, and known company name in both parts. Translate units in each part, for example Quantity: 1,000 pieces. and 数量：1,000件.",
};

export function buildSupplierMessageTranslationInstructions(input: {
  target: SupplierMessageLanguage;
  direction: "outbound" | "reply";
}) {
  const shared = [
    "Translate this business message for an import quotation.",
    "Preserve the numeric value of every quantity, price, diopter, MOQ, and commercial term.",
    "Keep diopters, currencies, MOQ, model codes, and Incoterms unchanged, including their original spelling and decimal points.",
    "Translate units of measure into the target language. Serbian kom, komad, and komada become English piece or pieces, and Simplified Chinese 件.",
    "In English, write quantity integers of 1,000 or more with a comma thousands separator, for example 1,000 pieces. Keep years, model codes, standards, decimal prices, and diopters unchanged, for example 2025, X5000, ISO 9001, 1.1 USD, and +1.50.",
    "In Simplified Chinese, use Arabic numerals and the unit 件 for quantities, for example 1,000件. Do not regroup years, model codes, or standards.",
    "Do not add prices, quantities, dates, supplier names, or terms that are not in the source.",
    "Do not omit any commercial fact.",
    "Never address the recipient by an internet domain or website host. If the source uses a domain as a name, or no real company name is known, use a neutral professional salutation: English 'Dear Supplier,', Simplified Chinese '您好：', Serbian 'Poštovani,'. Do not invent a company or contact name.",
    "Return only the translation.",
  ];
  const direction = input.direction === "reply"
    ? "The source is a supplier reply in English or Chinese. Translate the full reply into Serbian. Translate units into Serbian, for example pieces or pcs into komada, and write thousands with a Serbian dot separator, for example 1.000 komada."
    : `The source is the buyer's Serbian request. ${TARGET_INSTRUCTION[input.target]}`;
  return [...shared.slice(0, 9), direction, shared[9]].join(" ");
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function pricingFromEnv() {
  return {
    version: process.env.SUPPLIER_MESSAGE_OPENAI_PRICING_VERSION?.trim()
      || SUPPLIER_MESSAGE_PRICING.version,
    inputPricePerMillionUsd: envNumber(
      "SUPPLIER_MESSAGE_INPUT_PRICE_PER_MILLION_USD",
      SUPPLIER_MESSAGE_PRICING.inputPricePerMillionUsd,
    ),
    cachedInputPricePerMillionUsd: envNumber(
      "SUPPLIER_MESSAGE_CACHED_INPUT_PRICE_PER_MILLION_USD",
      SUPPLIER_MESSAGE_PRICING.cachedInputPricePerMillionUsd,
    ),
    outputPricePerMillionUsd: envNumber(
      "SUPPLIER_MESSAGE_OUTPUT_PRICE_PER_MILLION_USD",
      SUPPLIER_MESSAGE_PRICING.outputPricePerMillionUsd,
    ),
    webSearchPricePerCallUsd: 0,
  };
}

export function redactSupplierMessageSecret(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function outputText(payload: OpenAiPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const chunks = (payload.output ?? []).flatMap((item) =>
    (item.content ?? [])
      .filter((content) => content.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text ?? ""),
  );
  return chunks.join("\n").trim();
}

export function createOpenAiSupplierMessageTranslator(options: {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}): SupplierMessageTranslator {
  const apiKey = (options.apiKey ?? process.env.SUPPLIER_MESSAGE_OPENAI_API_KEY ?? "").trim();
  const model = (options.model ?? process.env.SUPPLIER_MESSAGE_OPENAI_MODEL ?? "gpt-5-mini").trim();
  const timeoutMs = options.timeoutMs
    ?? envNumber("SUPPLIER_MESSAGE_OPENAI_TIMEOUT_MS", 30_000);
  const fetcher = options.fetcher ?? fetch;

  return {
    async translate(input) {
      if (!apiKey) throw new SupplierMessageTranslationNotConfiguredError();
      const started = Date.now();
      const operation = input.direction === "reply"
        ? "supplier_reply_translation"
        : "supplier_message_translation";
      const instructions = buildSupplierMessageTranslationInstructions(input);
      let response: Response;
      try {
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            store: false,
            input: [
              { role: "developer", content: instructions },
              { role: "user", content: input.text },
            ],
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Translation request failed.";
        throw new Error(redactSupplierMessageSecret(message));
      }
      const payload = await response.json().catch(() => null) as OpenAiPayload | null;
      if (!response.ok || !payload) {
        throw new Error(redactSupplierMessageSecret(
          payload?.error?.message || `Translation request failed with status ${response.status}.`,
        ));
      }
      const text = outputText(payload).replace(/^```(?:\w+)?\s*|\s*```$/g, "").trim();
      if (!text || !payload.id) throw new Error("Translation response was empty.");
      return {
        text,
        usage: supplierMessageUsageEvent({
          operation,
          model: payload.model || model,
          responseId: payload.id,
          inputTokens: payload.usage?.input_tokens ?? 0,
          cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
          reasoningOutputTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? 0,
          totalTokens: payload.usage?.total_tokens ?? 0,
          durationMs: Date.now() - started,
          pricing: pricingFromEnv(),
        }),
      };
    },
  };
}
