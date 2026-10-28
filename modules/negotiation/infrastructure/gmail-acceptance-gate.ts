import { validGmailConnectCallback } from "@/modules/negotiation/infrastructure/gmail-connect-cookies";
import {
  assertGmailAcceptanceEnrollment,
  GmailAcceptanceDeniedError,
} from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

export type GmailGateDenial = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
};

function enrollmentDecision(
  actor: { organizationId: string; userId: string },
  env: NodeJS.ProcessEnv | undefined,
  unavailable: string,
): { ok: true } | GmailGateDenial {
  try {
    assertGmailAcceptanceEnrollment(actor, env);
    return { ok: true };
  } catch (error) {
    if (error instanceof GmailAcceptanceDeniedError) {
      return { ok: false, status: 403, error: "Nemate dozvolu." };
    }
    return { ok: false, status: 503, error: unavailable };
  }
}

/** New mailbox enrollment. Disconnect is intentionally not decided here. */
export function assessGmailConnectStart(input: {
  userId: string | null;
  organizationId: string | null;
  role: string | null;
  sameOrigin: boolean;
  env?: NodeJS.ProcessEnv;
}): { ok: true } | GmailGateDenial {
  if (!input.userId || !input.organizationId) {
    return { ok: false, status: 401, error: "Prijava je potrebna." };
  }
  if (!["OWNER", "ADMIN"].includes(input.role ?? "")) {
    return { ok: false, status: 403, error: "Nemate dozvolu." };
  }
  if (!input.sameOrigin) {
    return { ok: false, status: 403, error: "Zahtev nije dozvoljen." };
  }
  return enrollmentDecision(
    { organizationId: input.organizationId, userId: input.userId },
    input.env,
    "Gmail povezivanje još nije podešeno na ovom testnom okruženju.",
  );
}

/** Mailbox list used to choose a sender. Not the disconnect screen. */
export function assessGmailConnectionListing(input: {
  userId: string | null;
  organizationId: string | null;
  role: string | null;
  env?: NodeJS.ProcessEnv;
}): { ok: true } | GmailGateDenial {
  if (!input.userId || !input.organizationId) {
    return { ok: false, status: 401, error: "Prijava je potrebna." };
  }
  if (!["OWNER", "ADMIN"].includes(input.role ?? "")) {
    return { ok: false, status: 403, error: "Nemate dozvolu." };
  }
  return enrollmentDecision(
    { organizationId: input.organizationId, userId: input.userId },
    input.env,
    "Gmail povezivanje nije podešeno.",
  );
}

/**
 * Revalidates the callback against the current session, then the allowlist.
 * A swapped user or organization never reaches Google's token endpoint.
 */
export function decideGmailConnectCallback(input: {
  role: string | null;
  authenticatedUserId: string | null;
  authenticatedOrganizationId: string | null;
  cookieState?: string;
  state?: string | null;
  cookieVerifier?: string;
  cookieUserId?: string;
  cookieOrganizationId?: string;
  env?: NodeJS.ProcessEnv;
}):
  | { action: "exchange"; organizationId: string; userId: string }
  | { action: "redirect"; reason: "unauthorized" | "invalid-state" | "failed" } {
  if (
    !input.authenticatedUserId ||
    !input.authenticatedOrganizationId ||
    !["OWNER", "ADMIN"].includes(input.role ?? "")
  ) {
    return { action: "redirect", reason: "unauthorized" };
  }
  const bound = validGmailConnectCallback({
    cookieState: input.cookieState,
    state: input.state,
    cookieVerifier: input.cookieVerifier,
    cookieUserId: input.cookieUserId,
    cookieOrganizationId: input.cookieOrganizationId,
    authenticatedUserId: input.authenticatedUserId,
    authenticatedOrganizationId: input.authenticatedOrganizationId,
  });
  if (!bound) return { action: "redirect", reason: "invalid-state" };
  try {
    assertGmailAcceptanceEnrollment({
      organizationId: input.authenticatedOrganizationId,
      userId: input.authenticatedUserId,
    }, input.env);
  } catch (error) {
    if (error instanceof GmailAcceptanceDeniedError) {
      return { action: "redirect", reason: "unauthorized" };
    }
    return { action: "redirect", reason: "failed" };
  }
  return {
    action: "exchange",
    organizationId: input.authenticatedOrganizationId,
    userId: input.authenticatedUserId,
  };
}
