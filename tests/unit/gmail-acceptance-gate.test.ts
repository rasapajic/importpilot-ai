import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessGmailConnectionListing,
  assessGmailConnectStart,
  decideGmailConnectCallback,
} from "../../modules/negotiation/infrastructure/gmail-acceptance-gate";
import {
  assertGmailAcceptanceEnrollment,
  GMAIL_ACCEPTANCE_USER_LIMIT,
  GmailAcceptanceDeniedError,
  GmailConnectNotConfiguredError,
  gmailConnectionEnabled,
} from "../../modules/negotiation/infrastructure/gmail-connect-oauth";

const org = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
const otherOrg = "44444444-4444-4444-8444-444444444444";
const unlisted = "55555555-5555-4555-8555-555555555555";

function uuid(n: number) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function staging(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    RENDER_SERVICE_ID: "srv-datu3v093c1s73c17m60",
    JAKOV360_GMAIL_STAGING_ENABLED: "true",
    JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: org,
    JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: `${owner},${admin}`,
    ...overrides,
  } as unknown as NodeJS.ProcessEnv;
}

function callback(overrides: Partial<Parameters<typeof decideGmailConnectCallback>[0]> = {}) {
  return decideGmailConnectCallback({
    role: "OWNER",
    authenticatedUserId: owner,
    authenticatedOrganizationId: org,
    cookieState: "s".repeat(43),
    state: "s".repeat(43),
    cookieVerifier: "v".repeat(64),
    cookieUserId: owner,
    cookieOrganizationId: org,
    env: staging(),
    ...overrides,
  });
}

describe("acceptance organization and user allowlist", () => {
  it("admits only the designated staging user and keeps localhost behind the same list", () => {
    expect(() => assertGmailAcceptanceEnrollment({ organizationId: org, userId: owner }, staging()))
      .not.toThrow();
    expect(() => assertGmailAcceptanceEnrollment({
      organizationId: `  ${org.toUpperCase()}  `,
      userId: ` ${owner.toUpperCase()} `,
    }, staging({
      JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: ` ${org.toUpperCase()} `,
      JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: ` ${owner.toUpperCase()} , ${admin} `,
    }))).not.toThrow();

    const local = staging({
      RENDER_SERVICE_ID: undefined,
      NODE_ENV: "development",
    });
    expect(gmailConnectionEnabled(local)).toBe(true);
    expect(() => assertGmailAcceptanceEnrollment({ organizationId: org, userId: owner }, local)).not.toThrow();
    expect(() => assertGmailAcceptanceEnrollment(
      { organizationId: org, userId: unlisted },
      local,
    )).toThrow(GmailAcceptanceDeniedError);

    const boundedUsers = Array.from({ length: GMAIL_ACCEPTANCE_USER_LIMIT }, (_, index) => uuid(index + 1));
    expect(() => assertGmailAcceptanceEnrollment({
      organizationId: org,
      userId: boundedUsers[0],
    }, staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: boundedUsers.join(",") }))).not.toThrow();
  });

  it("denies an unlisted owner or admin and any other organization", () => {
    expect(() => assertGmailAcceptanceEnrollment({ organizationId: org, userId: unlisted }, staging()))
      .toThrow(GmailAcceptanceDeniedError);
    expect(() => assertGmailAcceptanceEnrollment({ organizationId: otherOrg, userId: owner }, staging()))
      .toThrow(GmailAcceptanceDeniedError);
    expect(assessGmailConnectStart({
      userId: unlisted,
      organizationId: org,
      role: "ADMIN",
      sameOrigin: true,
      env: staging(),
    })).toMatchObject({ ok: false, status: 403 });
    expect(assessGmailConnectionListing({
      userId: owner,
      organizationId: otherOrg,
      role: "OWNER",
      env: staging(),
    })).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed when the allowlist is missing, empty, or invalid", () => {
    const cases: NodeJS.ProcessEnv[] = [
      staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: "" }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: undefined }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: "" }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: undefined }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: "not-a-uuid" }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: "00000000-0000-0000-0000-000000000000" }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: `${owner},not-a-uuid` }),
      staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: `${owner},00000000-0000-0000-0000-000000000000` }),
      staging({
        JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: Array.from(
          { length: GMAIL_ACCEPTANCE_USER_LIMIT + 1 },
          (_, index) => uuid(index + 1),
        ).join(","),
      }),
      staging({ JAKOV360_GMAIL_STAGING_ENABLED: "false" }),
      staging({ RENDER_SERVICE_ID: "srv-production", NODE_ENV: "production" }),
      staging({ RENDER_SERVICE_ID: undefined, NODE_ENV: "production" }),
      staging({ RENDER_SERVICE_ID: undefined, NODE_ENV: "development", JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: "" }),
    ];
    for (const env of cases) {
      expect(() => assertGmailAcceptanceEnrollment({ organizationId: org, userId: owner }, env))
        .toThrow(GmailConnectNotConfiguredError);
    }
    expect(assessGmailConnectStart({
      userId: owner,
      organizationId: org,
      role: "OWNER",
      sameOrigin: true,
      env: staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: "org-1" }),
    })).toMatchObject({ ok: false, status: 503 });
  });

  it("keeps same-origin and owner/admin checks in front of a valid allowlist", () => {
    expect(assessGmailConnectStart({
      userId: null,
      organizationId: null,
      role: null,
      sameOrigin: true,
      env: staging(),
    })).toMatchObject({ ok: false, status: 401 });
    expect(assessGmailConnectStart({
      userId: owner,
      organizationId: org,
      role: "MEMBER",
      sameOrigin: true,
      env: staging(),
    })).toMatchObject({ ok: false, status: 403 });
    expect(assessGmailConnectStart({
      userId: owner,
      organizationId: org,
      role: "OWNER",
      sameOrigin: false,
      env: staging(),
    })).toMatchObject({ ok: false, status: 403, error: "Zahtev nije dozvoljen." });
    expect(assessGmailConnectStart({
      userId: owner,
      organizationId: org,
      role: "OWNER",
      sameOrigin: true,
      env: staging(),
    })).toEqual({ ok: true });
    expect(assessGmailConnectionListing({
      userId: admin,
      organizationId: org,
      role: "ADMIN",
      env: staging(),
    })).toEqual({ ok: true });
  });
});

describe("OAuth callback revalidates the session before enrollment", () => {
  it("exchanges only for the designated user whose cookies match the current session", () => {
    expect(callback()).toEqual({ action: "exchange", organizationId: org, userId: owner });
  });

  it("rejects a different session user or organization before token exchange", () => {
    expect(callback({
      authenticatedUserId: admin,
      cookieUserId: owner,
    })).toEqual({ action: "redirect", reason: "invalid-state" });
    expect(callback({
      authenticatedOrganizationId: otherOrg,
      cookieOrganizationId: org,
      env: staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: otherOrg }),
    })).toEqual({ action: "redirect", reason: "invalid-state" });
    expect(callback({ cookieState: "z".repeat(43) })).toEqual({
      action: "redirect",
      reason: "invalid-state",
    });
  });

  it("denies an unlisted matching session and missing configuration", () => {
    expect(callback({ authenticatedUserId: unlisted, cookieUserId: unlisted })).toEqual({
      action: "redirect",
      reason: "unauthorized",
    });
    expect(callback({ role: "MEMBER" })).toEqual({ action: "redirect", reason: "unauthorized" });
    expect(callback({ authenticatedUserId: null, authenticatedOrganizationId: null })).toEqual({
      action: "redirect",
      reason: "unauthorized",
    });
    expect(callback({
      env: staging({ JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: "" }),
    })).toEqual({ action: "redirect", reason: "failed" });
    expect(callback({
      env: staging({ JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: "bad" }),
    })).toEqual({ action: "redirect", reason: "failed" });
  });
});

describe("enrollment wiring preserves disconnect", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("gates start, callback, listing, preview and send, and leaves disconnect ungated", () => {
    expect(source("app/api/mail/google/start/route.ts")).toContain("assessGmailConnectStart");
    expect(source("app/api/mail/google/callback/route.ts")).toContain("decideGmailConnectCallback");
    expect(source("app/api/mail/google/connections/route.ts")).toContain("assessGmailConnectionListing");
    expect(source("app/(dashboard)/account/page.tsx")).toContain("assertGmailAcceptanceEnrollment");
    expect(source("app/(dashboard)/account/page.tsx")).toContain("listGmailMailboxConnections");
    const send = source("modules/negotiation/application/supplier-gmail-send-service.ts");
    expect(send).toContain("assertGmailAcceptanceEnrollment");
    expect(send).toContain("confirmationCount !== 1");
    const disconnect = source("app/api/mail/google/disconnect/route.ts");
    expect(disconnect).not.toContain("assertGmailAcceptanceEnrollment");
    expect(disconnect).not.toContain("assessGmailConnectStart");
    expect(disconnect).not.toContain("gmailAcceptanceAllowlist");
    expect(source(".env.example")).toContain("JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID=");
    expect(source(".env.example")).toContain("JAKOV360_GMAIL_ACCEPTANCE_USER_IDS=");
    expect(source("docs/JAKOV360_CONNECTED_MAIL_PLAN.md")).toContain("rfc822msgid:");
    expect(source("docs/JAKOV360_CONNECTED_MAIL_PLAN.md")).toContain("gmail.readonly");
  });
});
