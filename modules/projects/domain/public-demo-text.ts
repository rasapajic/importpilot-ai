export function publicProjectName(value: string) {
  return value.replace(/^JAKOV360 Acceptance pregled\s*[—-]\s*/i, "").trim();
}

export function publicOfferTitle(value: string) {
  return value
    .replace(/\s*[—-]\s*JAKOV360 acceptance primer\s*$/i, "")
    .replace(/\s*[—-]\s*retail primer za \d+ kom\s*$/i, "")
    .trim();
}

export function containsInternalAcceptanceText(value?: string | null) {
  return /acceptance|deterministički|lokalni acceptance projekat/i.test(value ?? "");
}
