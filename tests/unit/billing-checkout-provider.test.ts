import { describe, expect, it, vi } from "vitest";

import {
  BillingCheckoutProviderError,
  createHttpBillingCheckoutProvider,
} from "../../modules/subscriptions/infrastructure/checkout-provider";

describe("billing checkout provider", () => {
  it("returns a validated HTTPS checkout session", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      sessionId: "checkout_123",
      url: "https://payments.example/checkout/123",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const provider = createHttpBillingCheckoutProvider({
      endpoint: "https://billing.example/checkout",
      token: "billing-token-123456789",
      fetcher: fetcher as typeof fetch,
    });

    await expect(provider.createCheckoutSession({
      kind: "SUBSCRIPTION",
      organizationId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      email: "owner@example.test",
      plan: "PLUS",
      successUrl: "https://jakov360.com/billing?checkout=success",
      cancelUrl: "https://jakov360.com/billing?checkout=canceled",
    })).resolves.toEqual({
      sessionId: "checkout_123",
      url: "https://payments.example/checkout/123",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects an invalid checkout response", async () => {
    const provider = createHttpBillingCheckoutProvider({
      endpoint: "https://billing.example/checkout",
      token: "billing-token-123456789",
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        sessionId: "checkout_123",
        url: "http://insecure.example/checkout",
      }), { status: 200 })) as typeof fetch,
    });

    await expect(provider.createCheckoutSession({
      kind: "FULL_IMPORT_ANALYSIS",
      organizationId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      email: "owner@example.test",
      projectId: crypto.randomUUID(),
      successUrl: "https://jakov360.com/billing?checkout=success",
      cancelUrl: "https://jakov360.com/billing?checkout=canceled",
    })).rejects.toBeInstanceOf(BillingCheckoutProviderError);
  });
});
