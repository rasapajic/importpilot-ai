import { GMAIL_SEND_SCOPE } from "@/modules/negotiation/infrastructure/gmail-send-foundation";

/**
 * Real Google Gmail transport. Call only after a unique transactional send
 * claim is stored. No retry on network failure or on an ambiguous response.
 */
export type GoogleGmailSendProvider = {
  send(input: {
    refreshToken: string;
    raw: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{ providerMessageId: string; providerThreadId: string }>;
};

export class GmailProviderUncertainError extends Error {
  constructor() {
    super("Gmail delivery outcome requires manual reconciliation.");
    this.name = "GmailProviderUncertainError";
  }
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type RefreshResult = {
  token_type?: string;
  access_token?: string;
  scope?: string;
};

type GmailSendResponse = {
  id?: string;
  threadId?: string;
};

export function googleGmailSendProvider(
  fetcher: typeof fetch = fetch,
): GoogleGmailSendProvider {
  return {
    async send(input) {
      let refreshResponse: Response;
      try {
        refreshResponse = await fetcher(TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: input.refreshToken,
            client_id: input.clientId,
            client_secret: input.clientSecret,
          }),
          signal: AbortSignal.timeout(12_000),
          cache: "no-store",
        });
      } catch {
        throw new GmailProviderUncertainError();
      }
      const access = await refreshResponse.json().catch(() => null) as RefreshResult | null;
      // A refresh response may omit 'scope' when the original grant is unchanged.
      // Connected mailbox scopes were verified at original authorization time.
      if (
        !refreshResponse.ok ||
        access?.token_type?.toLowerCase() !== "bearer" ||
        !access?.access_token ||
        (access.scope && !access.scope.split(/\s+/).includes(GMAIL_SEND_SCOPE))
      ) {
        throw new GmailProviderUncertainError();
      }

      let response: Response;
      try {
        response = await fetcher(SEND_ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${access.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ raw: input.raw }),
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
      } catch {
        throw new GmailProviderUncertainError();
      }
      const sent = await response.json().catch(() => null) as GmailSendResponse | null;
      if (
        !response.ok ||
        !sent?.id ||
        !sent?.threadId ||
        sent.id.length > 255 ||
        sent.threadId.length > 255
      ) {
        // Do not automatically send the same message again, even on 5xx,
        // because receipt by Gmail can be ambiguous to the caller.
        throw new GmailProviderUncertainError();
      }
      return {
        providerMessageId: sent.id,
        providerThreadId: sent.threadId,
      };
    },
  };
}
