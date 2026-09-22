import { describe, expect, it, vi } from "vitest";

import { createOpenAIVoiceIntake } from "../src/openai-voice-intake.js";

describe("OpenAI voice intake", () => {
  it("transcribes audio then extracts product, quantity and destination", async () => {
    const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      const url = String(input);
      if (url.endsWith("/audio/transcriptions")) {
        return new Response(JSON.stringify({
          text: "Tražim 100 komada GaN punjača 65 W za Austriju.",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          product: "GaN punjač 65 W",
          quantity: 100,
          targetCountry: "AT",
        }),
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const parse = createOpenAIVoiceIntake({
      apiKey: "sk-test-voice",
      transcriptionModel: "gpt-4o-mini-transcribe",
      extractionModel: "gpt-5.6-luna",
      fetcher,
    });

    const result = await parse({
      audioBase64: Buffer.alloc(600, 7).toString("base64"),
      mimeType: "audio/webm",
      locale: "sr",
    });

    expect(result).toEqual({
      transcript: "Tražim 100 komada GaN punjača 65 W za Austriju.",
      product: "GaN punjač 65 W",
      quantity: 100,
      targetCountry: "AT",
    });
    expect(calls).toHaveLength(2);

    const secondInit = calls[1]?.init;
    expect(secondInit).toBeDefined();
    const body = JSON.parse(String(secondInit?.body)) as {
      model: string;
      store: boolean;
      text: { format: { type: string; name: string } };
    };
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "jakov360_voice_intake",
    });
  });

  it("rejects empty or oversized audio before calling OpenAI", async () => {
    const fetcher = vi.fn();
    const parse = createOpenAIVoiceIntake({
      apiKey: "sk-test-voice",
      fetcher: fetcher as typeof fetch,
    });

    await expect(parse({
      audioBase64: Buffer.alloc(10).toString("base64"),
      mimeType: "audio/webm",
      locale: "sr",
    })).rejects.toThrow("VOICE_AUDIO_SIZE_INVALID");

    expect(fetcher).not.toHaveBeenCalled();
  });
});
