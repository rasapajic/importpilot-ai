import { getStatusLabel, translateText, type Locale } from "../../i18n/translations";

const finalDecisionStatuses = new Set([
  "READY_TO_BUY",
  "NEGOTIATE_FIRST",
  "DO_NOT_BUY",
]);

export function isFinalDecisionStatus(status: string | null | undefined) {
  return Boolean(status && finalDecisionStatuses.has(status));
}

export function getDecisionStepSummary(
  status: string | null | undefined,
  locale: Locale | string,
) {
  if (!isFinalDecisionStatus(status)) {
    return translateText("Generate recommendation", locale);
  }
  return getStatusLabel(status!, locale);
}
