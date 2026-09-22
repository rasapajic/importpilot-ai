import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { resolveSupplierProviderEndpoints } from "@/modules/product-search/infrastructure/provider";

const MAX_VOICE_BYTES = 6_000_000;
const VOICE_TIMEOUT_MS = 40_000;

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  const localeValue = formData?.get("locale");
  const locale = localeValue === "de" || localeValue === "en" ? localeValue : "sr";

  if (!(audio instanceof File) || !audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "Neispravan audio snimak." }, { status: 400 });
  }
  if (audio.size < 200 || audio.size > MAX_VOICE_BYTES) {
    return NextResponse.json({ error: "Audio snimak je prazan ili prevelik." }, { status: 413 });
  }

  const { voiceEndpoint } = resolveSupplierProviderEndpoints();
  const token = process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN?.trim();
  if (!voiceEndpoint || !token) {
    return NextResponse.json({ error: "Govorni unos trenutno nije konfigurisan." }, { status: 503 });
  }

  const audioBytes = Buffer.from(await audio.arrayBuffer());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

  try {
    const response = await fetch(voiceEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audioBase64: audioBytes.toString("base64"),
        mimeType: audio.type || "audio/webm",
        locale,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null) as {
      transcript?: string;
      product?: string | null;
      quantity?: number | null;
      targetCountry?: "AT" | "DE" | "RS" | null;
      error?: string;
    } | null;

    if (!response.ok || !payload?.transcript) {
      return NextResponse.json(
        { error: payload?.error ?? "Govor nije mogao da se razume." },
        { status: response.status >= 400 ? response.status : 502 },
      );
    }

    return NextResponse.json({
      transcript: payload.transcript,
      product: payload.product ?? null,
      quantity: payload.quantity ?? null,
      targetCountry: payload.targetCountry ?? null,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Obrada govora je trajala predugo. Pokušajte ponovo."
          : "Govorni unos trenutno nije dostupan.",
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
