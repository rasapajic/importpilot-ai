import type { FxSnapshot } from "@/modules/fx/euro-display";

export const ECB_DAILY_FX_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_FX_SOURCE = "ECB euro foreign exchange reference rates";
export const ECB_FX_MAX_AGE_DAYS = 7;
const ECB_FX_TIMEOUT_MS = 5_000;

export class EcbFxUnavailableError extends Error {
  constructor(message = "ECB reference rates are unavailable.") {
    super(message);
    this.name = "EcbFxUnavailableError";
  }
}

function snapshotAgeDays(timestamp: string, now: Date) {
  const snapshotTime = Date.parse(timestamp);
  if (!Number.isFinite(snapshotTime)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - snapshotTime) / 86_400_000);
}

export function isEcbFxSnapshotFresh(
  snapshot: FxSnapshot,
  now = new Date(),
  maxAgeDays = ECB_FX_MAX_AGE_DAYS,
) {
  return snapshotAgeDays(snapshot.timestamp, now) <= maxAgeDays;
}

export function parseEcbDailyFxXml(xml: string): FxSnapshot {
  const dateMatch = xml.match(/<Cube\s+time=["']([^"']+)["'][^>]*>/i);
  if (!dateMatch?.[1] || !/^\d{4}-\d{2}-\d{2}$/.test(dateMatch[1])) {
    throw new EcbFxUnavailableError("ECB response does not contain a valid rate date.");
  }

  const ratesToEur: Record<string, number> = { EUR: 1 };
  const cubeTags = xml.match(/<Cube\b[^>]*\bcurrency=["'][A-Z]{3}["'][^>]*>/gi) ?? [];
  for (const tag of cubeTags) {
    const currencyMatch = tag.match(/\bcurrency=["']([A-Z]{3})["']/i);
    const rateMatch = tag.match(/\brate=["']([0-9]+(?:\.[0-9]+)?)["']/i);
    const currency = currencyMatch?.[1]?.toUpperCase();
    const foreignUnitsPerEur = Number(rateMatch?.[1]);
    if (!currency || !Number.isFinite(foreignUnitsPerEur) || foreignUnitsPerEur <= 0) continue;
    ratesToEur[currency] = 1 / foreignUnitsPerEur;
  }

  if (Object.keys(ratesToEur).length < 2) {
    throw new EcbFxUnavailableError("ECB response does not contain usable exchange rates.");
  }

  return {
    baseCurrency: "EUR",
    ratesToEur,
    source: ECB_FX_SOURCE,
    timestamp: `${dateMatch[1]}T00:00:00.000Z`,
  };
}

export async function getLatestEcbFxSnapshot(
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<FxSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ECB_FX_TIMEOUT_MS);
  try {
    const response = await fetcher(ECB_DAILY_FX_URL, {
      headers: { accept: "application/xml,text/xml;q=0.9" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new EcbFxUnavailableError(`ECB returned HTTP ${response.status}.`);
    }
    const snapshot = parseEcbDailyFxXml(await response.text());
    if (!isEcbFxSnapshotFresh(snapshot, now)) {
      throw new EcbFxUnavailableError("ECB reference-rate snapshot is stale.");
    }
    return snapshot;
  } catch (error) {
    if (error instanceof EcbFxUnavailableError) throw error;
    throw new EcbFxUnavailableError(
      error instanceof Error ? error.message : "ECB reference-rate request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
