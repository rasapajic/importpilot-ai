import { describe, expect, it } from "vitest";

import {
  EcbFxUnavailableError,
  getLatestEcbFxSnapshot,
  isEcbFxSnapshotFresh,
  parseEcbDailyFxXml,
} from "../../modules/fx/ecb-reference-rates";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-09-11">
      <Cube currency="USD" rate="1.1592"/>
      <Cube currency="CNY" rate="7.7762"/>
      <Cube currency="GBP" rate="0.86500"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB reference-rate snapshots", () => {
  it("parses ECB units-per-EUR rates into EUR-per-currency rates", () => {
    const snapshot = parseEcbDailyFxXml(xml);

    expect(snapshot.baseCurrency).toBe("EUR");
    expect(snapshot.timestamp).toBe("2026-09-11T00:00:00.000Z");
    expect(snapshot.ratesToEur.EUR).toBe(1);
    expect(snapshot.ratesToEur.USD).toBeCloseTo(1 / 1.1592, 10);
    expect(snapshot.ratesToEur.CNY).toBeCloseTo(1 / 7.7762, 10);
  });

  it("accepts a recent working-day snapshot across a weekend but rejects stale data", () => {
    const snapshot = parseEcbDailyFxXml(xml);

    expect(isEcbFxSnapshotFresh(snapshot, new Date("2026-09-13T12:00:00.000Z"))).toBe(true);
    expect(isEcbFxSnapshotFresh(snapshot, new Date("2026-09-20T12:00:00.000Z"))).toBe(false);
  });

  it("returns a fresh parsed snapshot from the ECB fetch", async () => {
    const fetcher = (async () => new Response(xml, { status: 200 })) as typeof fetch;
    const snapshot = await getLatestEcbFxSnapshot(
      fetcher,
      new Date("2026-09-13T12:00:00.000Z"),
    );

    expect(snapshot.ratesToEur.USD).toBeCloseTo(1 / 1.1592, 10);
  });

  it("fails closed on stale or unusable ECB data", async () => {
    const staleFetcher = (async () => new Response(xml, { status: 200 })) as typeof fetch;
    await expect(getLatestEcbFxSnapshot(
      staleFetcher,
      new Date("2026-09-21T12:00:00.000Z"),
    )).rejects.toBeInstanceOf(EcbFxUnavailableError);

    expect(() => parseEcbDailyFxXml("<Cube></Cube>"))
      .toThrow(EcbFxUnavailableError);
  });

  it("fails closed when ECB responds with an error", async () => {
    const fetcher = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(getLatestEcbFxSnapshot(
      fetcher,
      new Date("2026-09-13T12:00:00.000Z"),
    )).rejects.toBeInstanceOf(EcbFxUnavailableError);
  });
});
