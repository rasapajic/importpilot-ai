import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const originalAppOrigin = process.env.APP_ORIGIN;
const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const originalRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("APP_ORIGIN", originalAppOrigin);
  restore("GOOGLE_CLIENT_ID", originalClientId);
  restore("GOOGLE_CLIENT_SECRET", originalClientSecret);
  restore("GOOGLE_OAUTH_REDIRECT_URI", originalRedirectUri);
});

describe("Google auth routes", () => {
  it("starts a PKCE flow against the public APP_ORIGIN and stores short-lived HttpOnly cookies", async () => {
    process.env.APP_ORIGIN = "https://importpilot.example";
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret-123456789";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://importpilot.example/api/auth/google/callback";

    const { GET } = await import("@/app/api/auth/google/start/route");
    const response = await GET(new NextRequest(
      "http://internal-render-host:10000/api/auth/google/start?from=register",
    ));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri"))
      .toBe("https://importpilot.example/api/auth/google/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("state")).toBeTruthy();

    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("importpilot_google_oauth_state=");
    expect(cookies).toContain("importpilot_google_oauth_verifier=");
    expect(cookies).toContain("importpilot_google_oauth_flow=register");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(cookies).toContain("Path=/api/auth/google");
  });

  it("fails closed on a missing/mismatched state and redirects to the public login page", async () => {
    process.env.APP_ORIGIN = "https://importpilot.example";
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const response = await GET(new NextRequest(
      "http://internal-render-host:10000/api/auth/google/callback?code=abc&state=wrong-state",
      {
        headers: {
          cookie: [
            "importpilot_google_oauth_state=expected-state",
            "importpilot_google_oauth_verifier=verifier",
            "importpilot_google_oauth_flow=login",
          ].join("; "),
        },
      },
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location"))
      .toBe("https://importpilot.example/login?googleError=invalid-state");
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("Max-Age=0");
    expect(cookies).toContain("Path=/api/auth/google");
  });

  it("returns a controlled login error instead of starting OAuth when credentials are absent", async () => {
    process.env.APP_ORIGIN = "https://importpilot.example";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;

    const { GET } = await import("@/app/api/auth/google/start/route");
    const response = await GET(new NextRequest(
      "http://internal-render-host:10000/api/auth/google/start?from=login",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location"))
      .toBe("https://importpilot.example/login?googleError=not-configured");
  });
});
