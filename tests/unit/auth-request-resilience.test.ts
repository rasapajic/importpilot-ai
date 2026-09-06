import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const authFormSource = readFileSync(
  join(process.cwd(), "components/auth/auth-form.tsx"),
  "utf8",
);
const registerRouteSource = readFileSync(
  join(process.cwd(), "app/api/auth/register/route.ts"),
  "utf8",
);
const loginRouteSource = readFileSync(
  join(process.cwd(), "app/api/auth/login/route.ts"),
  "utf8",
);

describe("auth request resilience", () => {
  it("bounds browser auth requests and always clears pending state", () => {
    expect(authFormSource).toContain("AUTH_REQUEST_TIMEOUT_MS = 15_000");
    expect(authFormSource).toContain("new AbortController()");
    expect(authFormSource).toContain("signal: controller.signal");
    expect(authFormSource).toContain("readApiJson<AuthResponse>");
    expect(authFormSource).toContain("finally");
    expect(authFormSource).toContain("setPending(false)");
    expect(authFormSource).toContain("pendingRef.current = false");
  });

  it("returns controlled JSON for unexpected registration failures", () => {
    expect(registerRouteSource).toContain('event: "auth_register_failed"');
    expect(registerRouteSource).toContain('{ error: "AUTH_UNAVAILABLE" }');
    expect(registerRouteSource).not.toContain("throw error;");
  });

  it("returns controlled JSON for unexpected login failures", () => {
    expect(loginRouteSource).toContain('event: "auth_login_failed"');
    expect(loginRouteSource).toContain('{ error: "AUTH_UNAVAILABLE" }');
    expect(loginRouteSource).not.toContain("throw error;");
  });
});
