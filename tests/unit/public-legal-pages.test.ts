import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("public legal and Google data disclosure contract", () => {
  const home = source("app/page.tsx");
  const layout = source("app/layout.tsx");
  const privacy = source("app/privacy/page.tsx");
  const terms = source("app/terms/page.tsx");

  it("links public privacy and terms pages from the app shell", () => {
    expect(layout).toContain('href="/privacy"');
    expect(layout).toContain('href="/terms"');
    expect(layout).toContain("privacy@jakov360.com");
  });

  it("explains Google Sign-In data use on the public homepage", () => {
    expect(home).toContain("Google Sign-In");
    expect(home).toContain("verified email");
  });

  it("discloses the exact Google scopes and limited sign-in purpose", () => {
    expect(privacy).toContain("openid email profile");
    expect(privacy).toContain("not stored in the ImportPilot database");
    expect(privacy).toContain("does not request access");
    expect(privacy).toContain("privacy@jakov360.com");
  });

  it("publishes service terms that link back to privacy", () => {
    expect(terms).toContain('href="/privacy"');
    expect(terms).toContain("decision-support");
  });
});
