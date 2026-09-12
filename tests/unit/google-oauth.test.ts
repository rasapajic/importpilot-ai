import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthAttempt,
  exchangeGoogleCodeForIdentity,
  type GoogleOAuthConfig,
} from "../../modules/auth/infrastructure/google-oauth";

const config: GoogleOAuthConfig = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  redirectUri: "https://importpilot.example/api/auth/google/callback",
};

describe("Google OAuth transport", () => {
  it("uses state and PKCE without exposing the verifier in the authorization URL", () => {
    const attempt = createGoogleOAuthAttempt();
    const url = buildGoogleAuthorizationUrl(config, attempt);

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(attempt.challenge);
    expect(url.toString()).not.toContain(attempt.verifier);
  });

  it("exchanges the code and accepts only a verified Google email", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        expect(String(init?.body)).toContain("code=authorization-code");
        expect(String(init?.body)).toContain("code_verifier=pkce-verifier");
        return Response.json({ access_token: "google-access-token", token_type: "Bearer" });
      }
      expect(url).toContain("openidconnect.googleapis.com/v1/userinfo");
      expect((init?.headers as Record<string, string>).authorization)
        .toBe("Bearer google-access-token");
      return Response.json({
        sub: "google-user-123",
        email: "Person@Example.com",
        email_verified: true,
        name: "Google Person",
      });
    });

    await expect(exchangeGoogleCodeForIdentity(
      config,
      "authorization-code",
      "pkce-verifier",
      fetcher as typeof fetch,
    )).resolves.toEqual({
      providerAccountId: "google-user-123",
      email: "person@example.com",
      name: "Google Person",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects a Google profile whose email is not verified", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "google-access-token" });
      }
      return Response.json({
        sub: "google-user-123",
        email: "person@example.com",
        email_verified: false,
        name: "Google Person",
      });
    });

    await expect(exchangeGoogleCodeForIdentity(
      config,
      "authorization-code",
      "pkce-verifier",
      fetcher as typeof fetch,
    )).rejects.toThrow("verified email");
  });
});
