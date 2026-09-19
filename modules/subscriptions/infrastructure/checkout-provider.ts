import { z } from "zod";

export type BillingCheckoutRequest =
  | {
      kind: "SUBSCRIPTION";
      organizationId: string;
      userId: string;
      email: string;
      plan: "PLUS" | "PRO";
      successUrl: string;
      cancelUrl: string;
    }
  | {
      kind: "FULL_IMPORT_ANALYSIS";
      organizationId: string;
      userId: string;
      email: string;
      projectId: string;
      successUrl: string;
      cancelUrl: string;
    };

export type BillingCheckoutSession = {
  sessionId: string;
  url: string;
};

export interface BillingCheckoutProvider {
  createCheckoutSession(input: BillingCheckoutRequest): Promise<BillingCheckoutSession>;
}

export class BillingCheckoutProviderUnavailableError extends Error {
  constructor() {
    super("Billing checkout provider is not configured.");
    this.name = "BillingCheckoutProviderUnavailableError";
  }
}

export class BillingCheckoutProviderError extends Error {
  constructor(message = "Billing checkout provider request failed.") {
    super(message);
    this.name = "BillingCheckoutProviderError";
  }
}

const responseSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  url: z.string().url().refine((value) => value.startsWith("https://")),
}).strict();

export function createHttpBillingCheckoutProvider(input: {
  endpoint: string;
  token: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): BillingCheckoutProvider {
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = input.timeoutMs ?? 10_000;

  return {
    async createCheckoutSession(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(input.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new BillingCheckoutProviderError(
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : "Billing checkout provider returned an error.",
          );
        }
        const parsed = responseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new BillingCheckoutProviderError("Billing checkout provider returned an invalid response.");
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof BillingCheckoutProviderError) throw error;
        throw new BillingCheckoutProviderError(
          error instanceof Error ? error.message : "Billing checkout provider request failed.",
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getBillingCheckoutProvider(): BillingCheckoutProvider {
  const endpoint = process.env.BILLING_CHECKOUT_PROVIDER_URL?.trim();
  const token = process.env.BILLING_CHECKOUT_PROVIDER_TOKEN?.trim();
  if (!endpoint || !token) throw new BillingCheckoutProviderUnavailableError();
  return createHttpBillingCheckoutProvider({ endpoint, token });
}

export function isBillingCheckoutConfigured() {
  return Boolean(
    process.env.BILLING_CHECKOUT_PROVIDER_URL?.trim() &&
    process.env.BILLING_CHECKOUT_PROVIDER_TOKEN?.trim(),
  );
}
