import { prisma } from "@/lib/database/prisma";
import {
  decryptGmailRefreshToken,
  encryptGmailRefreshToken,
} from "@/modules/negotiation/infrastructure/gmail-credential-crypto";
import type { AuthorizedGmailMailbox } from "@/modules/negotiation/infrastructure/gmail-connect-oauth";

export async function connectGmailMailbox(input: {
  organizationId: string;
  connectedByUserId: string;
  mailbox: AuthorizedGmailMailbox;
}) {
  const encrypted = encryptGmailRefreshToken(
    input.mailbox.refreshToken,
    input.organizationId,
    input.mailbox.providerAccountId,
  );
  const connection = await prisma.mailboxConnection.upsert({
    where: {
      organizationId_provider_providerAccountId: {
        organizationId: input.organizationId,
        provider: "GMAIL",
        providerAccountId: input.mailbox.providerAccountId,
      },
    },
    create: {
      organizationId: input.organizationId,
      connectedByUserId: input.connectedByUserId,
      provider: "GMAIL",
      providerAccountId: input.mailbox.providerAccountId,
      mailboxEmail: input.mailbox.email,
      encryptedRefreshToken: encrypted,
      tokenKeyVersion: 1,
      grantedScopes: input.mailbox.grantedScopes,
    },
    update: {
      connectedByUserId: input.connectedByUserId,
      mailboxEmail: input.mailbox.email,
      encryptedRefreshToken: encrypted,
      tokenKeyVersion: 1,
      grantedScopes: input.mailbox.grantedScopes,
      disconnectedAt: null,
    },
    select: { id: true, mailboxEmail: true, organizationId: true },
  });
  return connection;
}

export async function listGmailMailboxConnections(organizationId: string) {
  return prisma.mailboxConnection.findMany({
    where: { organizationId, provider: "GMAIL", disconnectedAt: null },
    orderBy: { connectedAt: "desc" },
    select: { id: true, mailboxEmail: true, connectedAt: true, connectedByUserId: true },
  });
}

export async function disconnectGmailMailbox(input: {
  organizationId: string;
  connectionId: string;
  revoke?: (refreshToken: string) => Promise<void>;
}) {
  const current = await prisma.mailboxConnection.findFirst({
    where: {
      id: input.connectionId,
      organizationId: input.organizationId,
      provider: "GMAIL",
      disconnectedAt: null,
    },
    select: {
      id: true,
      providerAccountId: true,
      encryptedRefreshToken: true,
      tokenKeyVersion: true,
    },
  });
  if (!current) return false;

  let tokenForRevocation: string | null = null;
  // A missing/rotated encryption key must never prevent local disconnection.
  try {
    if (current.tokenKeyVersion === 1 && current.encryptedRefreshToken) {
      tokenForRevocation = decryptGmailRefreshToken(
        current.encryptedRefreshToken,
        input.organizationId,
        current.providerAccountId,
      );
    }
  } catch {
    tokenForRevocation = null;
  }

  const result = await prisma.mailboxConnection.updateMany({
    where: {
      id: current.id,
      organizationId: input.organizationId,
      provider: "GMAIL",
      disconnectedAt: null,
    },
    data: {
      encryptedRefreshToken: "",
      disconnectedAt: new Date(),
    },
  });
  if (result.count !== 1) return false;

  // Provider revocation is best effort after local credentials are destroyed.
  if (tokenForRevocation && input.revoke) {
    await input.revoke(tokenForRevocation).catch(() => undefined);
  }
  return true;
}

export async function revokeGoogleGmailToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
) {
  await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(8_000),
  });
}
