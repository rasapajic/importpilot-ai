import { z } from "zod";

const localeSchema = z.enum(["sr", "de", "en"]);
const targetCountrySchema = z.enum(["AT", "DE", "RS"]).nullable();

export const voiceIntakeRequestSchema = z.object({
  audioBase64: z.string().min(1).max(8_000_000),
  mimeType: z.string().trim().min(1).max(120),
  locale: localeSchema,
}).strict();

export const voiceIntakeResultSchema = z.object({
  transcript: z.string().trim().min(1).max(2_000),
  product: z.string().trim().min(2).max(300).nullable(),
  quantity: z.number().int().positive().max(2_147_483_647).nullable(),
  targetCountry: targetCountrySchema,
}).strict();

export type VoiceIntakeRequest = z.infer<typeof voiceIntakeRequestSchema>;
export type VoiceIntakeResult = z.infer<typeof voiceIntakeResultSchema>;

type Fetcher = typeof fetch;

type OpenAIVoiceOptions = {
  apiKey: string;
  transcriptionModel?: string;
  extractionModel?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string } | null;
};

function outputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("")
    .trim();
}

function extensionForMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "webm";
}

function language(locale: VoiceIntakeRequest["locale"]) {
  return locale === "sr" ? "sr" : locale === "de" ? "de" : "en";
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    product: { anyOf: [{ type: "string" }, { type: "null" }] },
    quantity: { anyOf: [{ type: "integer" }, { type: "null" }] },
    targetCountry: {
      anyOf: [
        { type: "string", enum: ["AT", "DE", "RS"] },
        { type: "null" },
      ],
    },
  },
  required: ["product", "quantity", "targetCountry"],
} as const;

export function createOpenAIVoiceIntake({
  apiKey,
  transcriptionModel = "gpt-4o-mini-transcribe",
  extractionModel = "gpt-5.6-luna",
  fetcher = fetch,
  timeoutMs = 30_000,
}: OpenAIVoiceOptions) {
  if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required for voice intake.");

  async function fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  return async function parseVoiceIntake(rawInput: unknown): Promise<VoiceIntakeResult> {
    const input = voiceIntakeRequestSchema.parse(rawInput);
    const audioBytes = Buffer.from(input.audioBase64, "base64");
    if (audioBytes.length < 200 || audioBytes.length > 6_000_000) {
      throw new Error("VOICE_AUDIO_SIZE_INVALID");
    }

    const transcriptionForm = new FormData();
    transcriptionForm.set("model", transcriptionModel);
    transcriptionForm.set("language", language(input.locale));
    transcriptionForm.set(
      "file",
      new Blob([new Uint8Array(audioBytes)], { type: input.mimeType }),
      `jakov360-voice.${extensionForMime(input.mimeType)}`,
    );

    const transcriptionResponse = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: transcriptionForm,
      },
    );
    const transcriptionPayload = await transcriptionResponse.json().catch(() => null) as {
      text?: string;
      error?: { message?: string };
    } | null;

    if (!transcriptionResponse.ok) {
      throw new Error(
        transcriptionPayload?.error?.message ??
        `OpenAI transcription returned HTTP ${transcriptionResponse.status}.`,
      );
    }

    const transcript = transcriptionPayload?.text?.trim() ?? "";
    if (!transcript) throw new Error("VOICE_TRANSCRIPT_EMPTY");

    const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: extractionModel,
        store: false,
        reasoning: { effort: "none" },
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: [
                "Extract a trade sourcing request from a speech transcript.",
                "Return only the requested structured fields.",
                "product: the product description, preserving useful specifications/model names.",
                "quantity: only the requested order quantity. Never mistake wattage, voltage, dimensions, model numbers or pack size for order quantity.",
                "targetCountry: AT for Austria/Austrija/Österreich, DE for Germany/Nemačka/Deutschland, RS for Serbia/Srbija/Serbien. Return null if no supported destination was clearly requested.",
                "Never invent a missing field. Remove conversational filler from product.",
              ].join("\n"),
            }],
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: `Locale: ${input.locale}\nTranscript: ${transcript}`,
            }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "jakov360_voice_intake",
            strict: true,
            schema: extractionSchema,
          },
        },
      }),
    });

    const payload = await response.json().catch(() => null) as OpenAIResponse | null;
    if (!response.ok || !payload) {
      throw new Error(
        payload?.error?.message ??
        `OpenAI extraction returned HTTP ${response.status}.`,
      );
    }

    const structuredText = outputText(payload);
    const structured = z.object({
      product: z.string().trim().min(2).max(300).nullable(),
      quantity: z.number().int().positive().max(2_147_483_647).nullable(),
      targetCountry: targetCountrySchema,
    }).strict().parse(JSON.parse(structuredText));

    return voiceIntakeResultSchema.parse({
      transcript,
      ...structured,
    });
  };
}
