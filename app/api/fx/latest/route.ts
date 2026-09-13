import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  EcbFxUnavailableError,
  getLatestEcbFxSnapshot,
} from "@/modules/fx/ecb-reference-rates";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    return NextResponse.json(await getLatestEcbFxSnapshot());
  } catch (error) {
    if (error instanceof EcbFxUnavailableError) {
      return NextResponse.json(
        { error: "Svež ECB kurs trenutno nije dostupan." },
        { status: 503 },
      );
    }
    throw error;
  }
}
