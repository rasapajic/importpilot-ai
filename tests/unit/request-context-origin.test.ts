import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isSameOrigin } from "../../modules/auth/infrastructure/request-context";

const originalAppOrigin = process.env.APP_ORIGIN;
const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;

afterEach(() => {
  if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalAppOrigin;

  if (originalRenderExternalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
  else process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
});

describe("same-origin auth guard", () => {
  it("accepts a direct same-origin request", () => {
    const request = new NextRequest("https://app.example/api/auth/register", {
      headers: { origin: "https://app.example" },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("accepts the configured public origin when the app runs behind a proxy", () => {
    process.env.APP_ORIGIN = "https://importpilot-1-0-staging.onrender.com";

    const request = new NextRequest("http://internal-render-host:10000/api/auth/register", {
      headers: { origin: "https://importpilot-1-0-staging.onrender.com" },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("accepts Render's platform-provided public URL as a trusted origin", () => {
    delete process.env.APP_ORIGIN;
    process.env.RENDER_EXTERNAL_URL = "https://importpilot-1-0-staging.onrender.com";

    const request = new NextRequest("http://internal-render-host:10000/api/auth/login", {
      headers: { origin: "https://importpilot-1-0-staging.onrender.com" },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("still rejects a different browser origin", () => {
    process.env.APP_ORIGIN = "https://importpilot-1-0-staging.onrender.com";

    const request = new NextRequest("http://internal-render-host:10000/api/auth/register", {
      headers: { origin: "https://attacker.example" },
    });

    expect(isSameOrigin(request)).toBe(false);
  });

  it("rejects requests without a valid Origin header", () => {
    process.env.APP_ORIGIN = "https://importpilot-1-0-staging.onrender.com";

    expect(isSameOrigin(new NextRequest("http://internal-render-host:10000/api/auth/register"))).toBe(false);
    expect(isSameOrigin(new NextRequest("http://internal-render-host:10000/api/auth/register", {
      headers: { origin: "not-a-url" },
    }))).toBe(false);
  });
});
