export type ProviderAuthenticationResult = {
  spf: "pass" | "fail" | "none";
  dkim: "pass" | "fail" | "none";
  dmarc: "pass" | "fail" | "none";
  alignedDomain: string | null;
};

export type SenderTrust = "ALIGNED" | "UNVERIFIED";

function emailDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase();
}

/**
 * Trust comes only from the result the provider context attached.
 * A raw Authentication-Results header is not an input to this function.
 */
export function resolveSenderTrust(input: {
  providerAuth: ProviderAuthenticationResult | null | undefined;
  expectedSupplierEmail: string | null | undefined;
  fromAddress: string;
}): SenderTrust {
  const expectedDomain = emailDomain(input.expectedSupplierEmail);
  const fromDomain = emailDomain(input.fromAddress);
  const alignedDomain = input.providerAuth?.alignedDomain?.trim().toLowerCase() || null;
  if (
    input.providerAuth?.dmarc === "pass" &&
    expectedDomain !== null &&
    alignedDomain === expectedDomain &&
    fromDomain === expectedDomain
  ) {
    return "ALIGNED";
  }
  return "UNVERIFIED";
}

export function storedAuthenticationResults(
  providerAuth: ProviderAuthenticationResult | null | undefined,
): Record<string, unknown> {
  return {
    source: "synthetic-provider-context",
    spf: providerAuth?.spf ?? "none",
    dkim: providerAuth?.dkim ?? "none",
    dmarc: providerAuth?.dmarc ?? "none",
    alignedDomain: providerAuth?.alignedDomain ?? null,
    ignoredRawAuthenticationResultsHeader: true,
  };
}
