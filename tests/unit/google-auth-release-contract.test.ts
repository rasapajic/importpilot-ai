import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const loginPage = source("app/(auth)/login/page.tsx");
const registerPage = source("app/(auth)/register/page.tsx");
const startRoute = source("app/api/auth/google/start/route.ts");
const callbackRoute = source("app/api/auth/google/callback/route.ts");
const authService = source("modules/auth/application/auth-service.ts");
const productionConfig = source("scripts/check-production-config.mjs");
const envExample = source(".env.example");
const stagingBlueprint = source("render.staging.yaml");
const runbook = source("RELEASE_1_0_RUNBOOK.md");

describe("ImportPilot 1.0 Google auth release contract", () => {
  it("offers Google auth on both login and registration", () => {
    expect(loginPage).toContain('<GoogleAuthButton mode="login"');
    expect(registerPage).toContain('<GoogleAuthButton mode="register"');
  });

  it("uses short-lived HttpOnly state and PKCE cookies", () => {
    expect(startRoute).toContain("GOOGLE_OAUTH_STATE_COOKIE");
    expect(startRoute).toContain("GOOGLE_OAUTH_VERIFIER_COOKIE");
    expect(startRoute).toContain("httpOnly: true");
    expect(startRoute).toContain('sameSite: "lax"');
    expect(callbackRoute).toContain("timingSafeEqual");
    expect(callbackRoute).toContain("safeEqual(expectedState, returnedState)");
    expect(callbackRoute).toContain("clearAttemptCookies");
  });

  it("links a verified Google identity to the existing email user before creating a new user", () => {
    expect(authService.indexOf("const existingUser = await tx.user.findUnique"))
      .toBeLessThan(authService.indexOf("const userId = crypto.randomUUID()"));
    expect(authService).toContain("linkedExistingUser: true");
    expect(authService).toContain("provider: OAuthProvider.GOOGLE");
    expect(authService).toContain("passwordHash: null");
  });

  it("documents and requires the production OAuth secrets and exact callback", () => {
    for (const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_OAUTH_REDIRECT_URI",
    ]) {
      expect(envExample).toContain(`${name}=`);
      expect(productionConfig).toContain(`\"${name}\"`);
      expect(stagingBlueprint).toContain(`key: ${name}`);
    }
    expect(productionConfig).toContain('/api/auth/google/callback');
    expect(stagingBlueprint).toContain("https://importpilot-1-0-staging.onrender.com/api/auth/google/callback");
    expect(runbook).toContain("Google authentication readiness");
    expect(runbook).toContain("GOOGLE_OAUTH_SETUP.md");
  });
});
