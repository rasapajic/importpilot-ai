"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import {
  DEFAULT_EUR_FX_SNAPSHOT,
  type FxSnapshot,
} from "@/modules/fx/euro-display";

export function FxSourceNote({ snapshot }: { snapshot?: FxSnapshot | null }) {
  const { t } = useI18n();
  const activeSnapshot = snapshot ?? DEFAULT_EUR_FX_SNAPSHOT;
  return (
    <small className="fx-source-note">
      {t("FX source")}: {activeSnapshot.source} · {t("Exchange rate timestamp")}:{" "}
      {activeSnapshot.timestamp.slice(0, 10)}
    </small>
  );
}
