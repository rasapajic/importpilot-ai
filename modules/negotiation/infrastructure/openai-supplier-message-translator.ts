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
  EN: "Write the full message in professional business English.",
  ZH: "Write the full message in professional Simplified Chinese.",
  EN_ZH: "Write the full message in professional business English, then a line containing only ---, then the same full message in professional Simplified Chinese. Repeat every number, currency, diopter, MOQ, model, Incoterm, and supplier name in both parts.",
};

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
      const instructions = [
        "Translate this business message for an import quotation.",
        "Preserve every number, currency, diopter, MOQ, model, Incoterm, supplier name, and unit exactly.",
        "Do not add prices, quantities, dates, or terms that are not in the source.",
        "Do not omit any commercial fact.",
        input.direction === "reply"
          ? "The source is a supplier reply in English or Chinese. Translate the full reply into Serbian for the buyer."
          : `The source is the buyer's Serbian request. ${TARGET_INSTRUCTION[input.target]}`,
        "Return only the translation.",
      ].join(" ");
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
