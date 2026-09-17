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
const nativeAuthSource = readFileSync(
  join(process.cwd(), "modules/auth/infrastructure/native-auth.ts"),
  "utf8",
);

describe("auth request resilience", () => {
  it("bounds hydrated browser auth requests and always clears pending state", () => {
    expect(authFormSource).toContain("AUTH_REQUEST_TIMEOUT_MS = 15_000");
    expect(authFormSource).toContain("new AbortController()");
    expect(authFormSource).toContain("signal: controller.signal");
    expect(authFormSource).toContain("readApiJson<AuthResponse>");
    expect(authFormSource).toContain("finally");
    expect(authFormSource).toContain("setPending(false)");
    expect(authFormSource).toContain("pendingRef.current = false");
  });

  it("has a native POST fallback so a pre-hydration submit cannot leak credentials into the URL", () => {
    expect(authFormSource).toContain('action={`/api/auth/${mode}`}');
    expect(authFormSource).toContain('method="post"');
    expect(nativeAuthSource).toContain('application/x-www-form-urlencoded');
    expect(nativeAuthSource).toContain("request.formData()");
    expect(nativeAuthSource).toContain("NextResponse.redirect(url, 303)");
    expect(registerRouteSource).toContain("isNativeAuthFormPost(request)");
    expect(loginRouteSource).toContain("isNativeAuthFormPost(request)");
    expect(registerRouteSource).toContain('nativeAuthRedirect(request, "/dashboard")');
    expect(loginRouteSource).toContain('nativeAuthRedirect(request, "/dashboard")');
  });

  it("returns controlled JSON or localized form redirect for unexpected registration failures", () => {
    expect(registerRouteSource).toContain('event: "auth_register_failed"');
    expect(registerRouteSource).toContain('"unavailable", "AUTH_UNAVAILABLE", 500');
    expect(registerRouteSource).toContain("errorResponse(request, nativeForm");
    expect(registerRouteSource).not.toContain("throw error;");
  });

  it("returns controlled JSON or localized form redirect for unexpected login failures", () => {
    expect(loginRouteSource).toContain('event: "auth_login_failed"');
    expect(loginRouteSource).toContain('"unavailable", "AUTH_UNAVAILABLE", 500');
    expect(loginRouteSource).toContain("errorResponse(request, nativeForm");
    expect(loginRouteSource).not.toContain("throw error;");
  });
});
