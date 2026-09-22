import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const intake = source("components/dashboard/dashboard-primary-actions.tsx");
const route = source("app/api/voice-intake/route.ts");
const provider = source("modules/product-search/infrastructure/provider.ts");
const voiceService = source("services/importpilot-search-provider/src/openai-voice-intake.ts");
const providerApp = source("services/importpilot-search-provider/src/app.ts");

describe("JAKOV360 OpenAI voice intake contract", () => {
  it("records raw microphone audio and exposes an explicit stop control", () => {
    expect(intake).toContain("new MediaRecorder");
    expect(intake).toContain("navigator.mediaDevices.getUserMedia");
    expect(intake).toContain('voiceStop: "ZAUSTAVI"');
    expect(intake).toContain("recorder.stop()");
    expect(intake).toContain("voiceMeterRef");
    expect(intake).not.toContain("SpeechRecognition");
  });

  it("keeps audio and OpenAI credentials server-side", () => {
    expect(intake).toContain('fetch("/api/voice-intake"');
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("SUPPLIER_SEARCH_PROVIDER_TOKEN");
    expect(route).not.toContain("OPENAI_API_KEY");
    expect(provider).toContain("/voice-intake");
  });

  it("uses OpenAI transcription plus a low-cost structured extraction model", () => {
    expect(voiceService).toContain("gpt-4o-mini-transcribe");
    expect(voiceService).toContain("gpt-5.6-luna");
    expect(voiceService).toContain("/v1/audio/transcriptions");
    expect(voiceService).toContain("/v1/responses");
    expect(voiceService).toContain('type: "json_schema"');
    expect(voiceService).toContain("Never mistake wattage");
  });

  it("exposes the authenticated voice endpoint from the existing search provider", () => {
    expect(providerApp).toContain('request.url === "/voice-intake"');
    expect(providerApp).toContain("voiceIntakeRequestSchema.safeParse");
  });
});
