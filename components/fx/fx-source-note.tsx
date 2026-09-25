"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { DEFAULT_EUR_FX_SNAPSHOT, getFxSnapshotStatus } from "@/modules/fx/euro-display";

export function FxSourceNote() {
  const { t } = useI18n();
  const status = getFxSnapshotStatus(DEFAULT_EUR_FX_SNAPSHOT);
  return (
    <small className="fx-source-note">
      {t("FX source")}: {DEFAULT_EUR_FX_SNAPSHOT.source} · {t("Exchange rate timestamp")}:{" "}
      {DEFAULT_EUR_FX_SNAPSHOT.timestamp.slice(0, 10)} · {status.isTest || status.stale
        ? t("Testni/zastareo kurs — samo informativno")
        : t("Aktuelan kurs")}
    </small>
  );
}
