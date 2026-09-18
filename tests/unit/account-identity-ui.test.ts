import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("account identity UI", () => {
  const header = source("components/layout/global-header-actions.tsx");
  const account = source("app/(dashboard)/account/page.tsx");

  it("routes the Account action to a dedicated account page", () => {
    expect(header).toContain('href="/account"');
    expect(header).toContain('pathname === "/account"');
  });

  it("shows the authenticated user's identity and organization", () => {
    expect(account).toContain("requireSession()");
    expect(account).toContain("user.email");
    expect(account).toContain("user.name");
    expect(account).toContain("membership.organization.name");
    expect(account).toContain("Prijavljeni ste kao");
  });
});
