import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isSameOrigin } from "@/modules/auth/infrastructure/request-context";

const stagingOrigin = "https://jakov360-acceptance-staging.onrender.com";
const originalConfiguredOrigin = process.env.AUTH_TRUSTED_PROXY_ORIGIN;

function requestWithHeaders(headers: Record<string, string>) {
  return new NextRequest("http://localhost:10000/api/auth/login", { headers });
}

afterEach(() => {
  if (originalConfiguredOrigin === undefined) {
    delete process.env.AUTH_TRUSTED_PROXY_ORIGIN;
  } else {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = originalConfiguredOrigin;
  }
});

describe("auth request origin validation", () => {
  it("keeps direct local same-origin requests unchanged", () => {
    delete process.env.AUTH_TRUSTED_PROXY_ORIGIN;

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      headers: { origin: "http://localhost:3000" },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("accepts the exact configured Render staging origin", () => {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = stagingOrigin;

    expect(
      isSameOrigin(
        requestWithHeaders({
          origin: stagingOrigin,
          "x-forwarded-host": "jakov360-acceptance-staging.onrender.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a spoofed forwarded host", () => {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = stagingOrigin;

    expect(
      isSameOrigin(
        requestWithHeaders({
          origin: stagingOrigin,
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a production host", () => {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = stagingOrigin;

    expect(
      isSameOrigin(
        requestWithHeaders({
          origin: "https://jakov360.com",
          "x-forwarded-host": "jakov360.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe(false);
  });

  it("rejects the wrong forwarded protocol", () => {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = stagingOrigin;

    expect(
      isSameOrigin(
        requestWithHeaders({
          origin: stagingOrigin,
          "x-forwarded-host": "jakov360-acceptance-staging.onrender.com",
          "x-forwarded-proto": "http",
        }),
      ),
    ).toBe(false);
  });

  it.each([
    {
      "x-forwarded-host":
        "jakov360-acceptance-staging.onrender.com, attacker.example",
      "x-forwarded-proto": "https",
    },
    {
      "x-forwarded-host": "jakov360-acceptance-staging.onrender.com",
      "x-forwarded-proto": "https,http",
    },
  ])("rejects comma-separated forwarded values", (forwardedHeaders) => {
    process.env.AUTH_TRUSTED_PROXY_ORIGIN = stagingOrigin;

    expect(
      isSameOrigin(
        requestWithHeaders({ origin: stagingOrigin, ...forwardedHeaders }),
      ),
    ).toBe(false);
  });
});
