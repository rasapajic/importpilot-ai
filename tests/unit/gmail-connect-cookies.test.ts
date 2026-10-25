import { describe, expect, it } from "vitest";
import { validGmailConnectCallback } from "../../modules/negotiation/infrastructure/gmail-connect-cookies";

const valid = {
  cookieState: "x".repeat(43),
  state: "x".repeat(43),
  cookieVerifier: "y".repeat(64),
  cookieUserId: "user-a",
  cookieOrganizationId: "organization-a",
  authenticatedUserId: "user-a",
  authenticatedOrganizationId: "organization-a",
};

describe("Gmail connect callback identity binding", () => {
  it("accepts a single matching OAuth state and tenant-bound PKCE attempt", () => {
    expect(validGmailConnectCallback(valid)).toBe(true);
  });

  it.each([
    { state: "z".repeat(43) },
    { state: "é".repeat(43) }, // same code-point count, different UTF-8 byte length
    { state: null },
    { cookieState: undefined },
    { cookieVerifier: "" },
    { cookieVerifier: "malformed?" },
    { cookieUserId: "user-other" },
    { cookieOrganizationId: "organization-other" },
    { authenticatedUserId: "user-other" },
    { authenticatedOrganizationId: "organization-other" },
  ])("rejects session/tenant swapping or missing state: %j", (patch) => {
    expect(validGmailConnectCallback({ ...valid, ...patch })).toBe(false);
  });
});
