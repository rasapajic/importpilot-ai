import { afterEach, describe, expect, it } from "vitest";

import {
  buildSupplierMessageTranslationInstructions,
  createOpenAiSupplierMessageTranslator,
  SupplierMessageTranslationNotConfiguredError,
} from "../../modules/negotiation/infrastructure/openai-supplier-message-translator";

const pricingEnv = [
  "SUPPLIER_MESSAGE_OPENAI_API_KEY",
  "SUPPLIER_MESSAGE_OPENAI_MODEL",
  "SUPPLIER_MESSAGE_OPENAI_PRICING_VERSION",
  "SUPPLIER_MESSAGE_INPUT_PRICE_PER_MILLION_USD",
  "SUPPLIER_MESSAGE_CACHED_INPUT_PRICE_PER_MILLION_USD",
  "SUPPLIER_MESSAGE_OUTPUT_PRICE_PER_MILLION_USD",
  "OPENAI_API_KEY",
] as const;

const savedEnv = new Map<string, string | undefined>();

function hideProviderKeys() {
  for (const name of pricingEnv) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.OPENAI_API_KEY = "sk-search-provider-key";
}

afterEach(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("OpenAI supplier message translator", () => {
  it("translates without web search and records the token cost", async () => {
    hideProviderKeys();
    let requestBody = "";
    const translator = createOpenAiSupplierMessageTranslator({
      apiKey: "sk-test-translation",
      model: "gpt-5-mini",
      fetcher: async (input, init) => {
        requestBody = String(init?.body ?? "");
        expect(String(input)).toBe("https://api.openai.com/v1/responses");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer sk-test-translation");
        return Response.json({
          id: "resp-translation-1",
          model: "gpt-5-mini",
          output_text: "Please confirm 1,000 pieces at USD 1.1.",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: { cached_tokens: 40 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        });
      },
    });

    const result = await translator.translate({
      text: "Količina: 1.000 komada. Cena 1.1 USD.",
      target: "EN",
      direction: "outbound",
    });
    const payload = JSON.parse(requestBody) as { store?: boolean; tools?: unknown };
    expect(payload.store).toBe(false);
    expect(payload.tools).toBeUndefined();
    expect(requestBody).not.toContain("web_search");
    expect(result.usage).toMatchObject({
      provider: "openai",
      operation: "supplier_message_translation",
      model: "gpt-5-mini",
      responseId: "resp-translation-1",
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 50,
      webSearchCalls: 0,
      currency: "USD",
      estimated: true,
    });
    expect(result.usage.estimatedTotalCostUsd).toBeCloseTo(0.000116, 8);
    const instructions = buildSupplierMessageTranslationInstructions({
      target: "EN",
      direction: "outbound",
    });
    expect(requestBody).toContain(instructions);
    expect(instructions).toContain("1,000 pieces");
    expect(instructions).toContain("1,000件");
    expect(instructions).toContain("Dear Supplier,");
    expect(instructions).toContain("+1.50");
    expect(instructions).toContain("1.1 USD");
    expect(instructions).not.toContain("unit exactly");
    expect(instructions).toContain("Do not invent a company or contact name.");
  });

  it("ignores the search-provider key and redacts secrets from failures", async () => {
    hideProviderKeys();
    const missing = createOpenAiSupplierMessageTranslator();
    await expect(missing.translate({
      text: "Upit",
      target: "EN",
      direction: "outbound",
    })).rejects.toBeInstanceOf(SupplierMessageTranslationNotConfiguredError);

    const translator = createOpenAiSupplierMessageTranslator({
      apiKey: "sk-test-translation",
      fetcher: async () => {
        throw new Error("request failed for sk-test-translation Bearer sk-test-translation");
      },
    });
    await expect(translator.translate({
      text: "Upit",
      target: "ZH",
      direction: "reply",
    })).rejects.toThrow(/\[REDACTED\]/);
    await expect(translator.translate({
      text: "Upit",
      target: "ZH",
      direction: "reply",
    })).rejects.not.toThrow(/sk-/);
  });
});
