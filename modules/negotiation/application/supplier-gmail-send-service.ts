import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { checkSupplierMailSendIntent } from "@/modules/negotiation/domain/supplier-mail-link";
import {
  isStagingSupplierMailRecipient,
  supplierMailApprovalHash,
} from "@/modules/negotiation/domain/supplier-mail-approval";
import { usableInquiryTranslation } from "@/modules/negotiation/domain/supplier-message";
import { decryptGmailRefreshToken } from "@/modules/negotiation/infrastructure/gmail-credential-crypto";
import {
  assertGmailAcceptanceEnrollment,
  gmailConnectionConfig,
} from "@/modules/negotiation/infrastructure/gmail-connect-oauth";
import { encodeGmailTextMessage, GMAIL_SEND_SCOPE } from "@/modules/negotiation/infrastructure/gmail-send-foundation";
import {
  googleGmailSendProvider,
  type GoogleGmailSendProvider,
} from "@/modules/negotiation/infrastructure/google-gmail-send-provider";
import { canonicalSupplierProductUrl } from "@/modules/product-search/domain/supplier-product-url";

export class SupplierGmailSendBlockedError extends Error {
  constructor(readonly code: string) {
    super("Gmail send is not permitted for this draft.");
    this.name = "SupplierGmailSendBlockedError";
  }
}

export class SupplierGmailSendUncertainError extends Error {
  constructor() {
    super("Gmail delivery is unconfirmed. Do not resend until reconciled.");
    this.name = "SupplierGmailSendUncertainError";
  }
}

export type GmailReconciliationEvidence = {
  service: "importpilot-app";
  event: "gmail_send_reconciliation_required";
  claimId: string;
  organizationId: string;
  confirmationId: string;
  rfcMessageId: string;
  providerMessageId: string;
  providerThreadId: string;
  persisted: boolean;
};

/** Safe operator evidence. No message body, recipient, or OAuth credential. */
export function gmailAcceptanceReconciliationEvidence(input: {
  claimId: string;
  organizationId: string;
  confirmationId: string;
  rfcMessageId: string;
  providerMessageId: string;
  providerThreadId: string;
  persisted: boolean;
}): GmailReconciliationEvidence {
  return {
    service: "importpilot-app",
    event: "gmail_send_reconciliation_required",
    claimId: input.claimId,
    organizationId: input.organizationId,
    confirmationId: input.confirmationId,
    rfcMessageId: input.rfcMessageId,
    providerMessageId: input.providerMessageId,
    providerThreadId: input.providerThreadId,
    persisted: input.persisted,
  };
}

type GmailAcceptanceTx = {
  updatePreparedConfirmation: (target: {
    confirmationId: string;
    organizationId: string;
  }) => Promise<number>;
  updatePendingDelivery: (target: {
    claimId: string;
    organizationId: string;
    providerMessageId: string;
    providerThreadId: string;
    status: "SENT" | "UNCERTAIN";
  }) => Promise<number>;
};

/**
 * Mark the outbox SENT only when this transaction moves the confirmation
 * from PREPARED to SENT. A zero-row confirmation update stores provider IDs
 * on an UNCERTAIN row and must not be reported as SENT.
 */
export async function reconcileAcceptedGmailDelivery(
  db: { transaction: <T>(fn: (tx: GmailAcceptanceTx) => Promise<T>) => Promise<T> },
  input: {
    claimId: string;
    organizationId: string;
    confirmationId: string;
    providerMessageId: string;
    providerThreadId: string;
  },
): Promise<"SENT" | "UNCERTAIN"> {
  return db.transaction(async (tx) => {
    const confirmationCount = await tx.updatePreparedConfirmation({
      confirmationId: input.confirmationId,
      organizationId: input.organizationId,
    });
    if (confirmationCount !== 1) {
      const blocked = await tx.updatePendingDelivery({
        claimId: input.claimId,
        organizationId: input.organizationId,
        providerMessageId: input.providerMessageId,
        providerThreadId: input.providerThreadId,
        status: "UNCERTAIN",
      });
      if (blocked !== 1) throw new Error("Gmail acceptance evidence was not stored.");
      return "UNCERTAIN";
    }
    const sent = await tx.updatePendingDelivery({
      claimId: input.claimId,
      organizationId: input.organizationId,
      providerMessageId: input.providerMessageId,
      providerThreadId: input.providerThreadId,
      status: "SENT",
    });
    if (sent !== 1) throw new Error("Gmail delivery was not marked sent.");
    return "SENT";
  });
}

export async function recordAcceptedGmailReceipt(
  input: {
    claimId: string;
    organizationId: string;
    confirmationId: string;
    rfcMessageId: string;
    providerMessageId: string;
    providerThreadId: string;
  },
  io: {
    reconcile: () => Promise<"SENT" | "UNCERTAIN">;
    blockPending: () => Promise<void>;
    log?: (evidence: GmailReconciliationEvidence) => void;
  },
): Promise<{ status: "SENT"; providerMessageId: string; providerThreadId: string }> {
  const emit = io.log ?? ((evidence: GmailReconciliationEvidence) => {
    console.error(JSON.stringify(evidence));
  });
  const evidence = (persisted: boolean) => gmailAcceptanceReconciliationEvidence({
    ...input,
    persisted,
  });
  try {
    const outcome = await io.reconcile();
    if (outcome !== "SENT") {
      emit(evidence(true));
      throw new SupplierGmailSendUncertainError();
    }
    return {
      status: "SENT",
      providerMessageId: input.providerMessageId,
      providerThreadId: input.providerThreadId,
    };
  } catch (error) {
    if (error instanceof SupplierGmailSendUncertainError) throw error;
    let persisted = false;
    try {
      await io.blockPending();
      persisted = true;
    } catch {
      persisted = false;
    }
    emit(evidence(persisted));
    throw new SupplierGmailSendUncertainError();
  }
}

type PreviewRequest = {
  organizationId: string;
  userId: string;
  projectId: string;
  productUrl: string;
  mailboxConnectionId: string;
  recipient: string;
};

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function currentOutboundTranslation(row: {
  sourceMessage: string;
  targetLanguage: string | null;
  translatedMessage: string;
  translationInputHash: string | null;
}): string | null {
  const language = row.targetLanguage;
  if (!language || !["EN", "ZH", "EN_ZH"].includes(language)) return null;
  const selected = language as "EN" | "ZH" | "EN_ZH";
  const currentSource = row.sourceMessage.trim();
  if (!currentSource) return null;
  return usableInquiryTranslation({
    selectedLanguage: selected,
    savedLanguage: selected,
    translatedMessage: row.translatedMessage,
    sourceIsCurrent: true,
    translationCurrent:
      row.translationInputHash === sha256(`${language}\n${currentSource}`),
  });
}

type OutboundSnapshot = {
  confirmationId: string;
  organizationId: string;
  mailboxConnectionId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  approvalHash: string;
  encryptedToken: string;
  tokenKeyVersion: number;
  providerAccountId: string;
};

function snapshotFromRows(input: {
  request: PreviewRequest;
  confirmation: {
    id: string;
    organizationId: string;
    status: "FOUND" | "PREPARED" | "SENT" | "RESPONSE_RECEIVED" | "DOCUMENTED";
    sourceMessage: string;
    targetLanguage: string | null;
    translatedMessage: string;
    translationInputHash: string | null;
    subject: string;
  };
  mailbox: {
    id: string;
    organizationId: string;
    mailboxEmail: string;
    encryptedRefreshToken: string;
    tokenKeyVersion: number;
    providerAccountId: string;
    grantedScopes: string;
    disconnectedAt: Date | null;
  };
  alreadyClaimed: boolean;
  approvedHash: string | null;
  explicitApproval: boolean;
}): OutboundSnapshot {
  const { request, confirmation, mailbox } = input;
  const body = currentOutboundTranslation(confirmation);
  const recipient = request.recipient.trim().toLowerCase();
  if (!isStagingSupplierMailRecipient(recipient)) {
    throw new SupplierGmailSendBlockedError("TEST_RECIPIENT_NOT_ALLOWED");
  }
  if (!mailbox.grantedScopes.split(/\s+/).includes(GMAIL_SEND_SCOPE)) {
    throw new SupplierGmailSendBlockedError("GMAIL_SEND_SCOPE_MISSING");
  }
  if (!body) throw new SupplierGmailSendBlockedError("TRANSLATION_NOT_CURRENT");
  const subject = confirmation.subject.trim();
  if (!subject || subject.length > 500) {
    throw new SupplierGmailSendBlockedError("INVALID_SUBJECT");
  }
  const digest = supplierMailApprovalHash({
    organizationId: request.organizationId,
    confirmationId: confirmation.id,
    mailboxConnectionId: mailbox.id,
    from: mailbox.mailboxEmail,
    to: recipient,
    subject,
    body,
  });
  const decision = checkSupplierMailSendIntent({
    organizationId: request.organizationId,
    confirmationOrganizationId: confirmation.organizationId,
    mailboxOrganizationId: mailbox.organizationId,
    connectedMailboxAddress: mailbox.mailboxEmail,
    selectedFromAddress: mailbox.mailboxEmail,
    recipientAddress: recipient,
    confirmationStatus: confirmation.status,
    connectionActive:
      mailbox.disconnectedAt === null &&
      Boolean(mailbox.encryptedRefreshToken) &&
      mailbox.tokenKeyVersion === 1,
    confirmationAlreadySent: input.alreadyClaimed,
    userApprovedSend: input.explicitApproval,
    approvedContentHash: input.approvedHash,
    currentContentHash: digest,
    sourceAndTranslationCurrent: Boolean(body),
  });
  if (!decision.allowed) {
    throw new SupplierGmailSendBlockedError(decision.reason);
  }
  // Reject header injection before creating a durable provider attempt.
  encodeGmailTextMessage({
    from: mailbox.mailboxEmail,
    to: recipient,
    subject,
    body,
    rfcMessageId: "<preflight@jakov360.com>",
  });
  return {
    confirmationId: confirmation.id,
    organizationId: request.organizationId,
    mailboxConnectionId: mailbox.id,
    from: mailbox.mailboxEmail,
    to: recipient,
    subject,
    body,
    approvalHash: digest,
    encryptedToken: mailbox.encryptedRefreshToken,
    tokenKeyVersion: mailbox.tokenKeyVersion,
    providerAccountId: mailbox.providerAccountId,
  };
}

async function memberCanSend(organizationId: string, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return member?.role === "OWNER" || member?.role === "ADMIN";
}

async function lookupRequest(request: PreviewRequest) {
  const [confirmation, mailbox, member] = await Promise.all([
    prisma.supplierConfirmation.findUnique({
      where: {
        organizationId_projectId_productUrl: {
          organizationId: request.organizationId,
          projectId: request.projectId,
          productUrl: canonicalSupplierProductUrl(request.productUrl),
        },
      },
    }),
    prisma.mailboxConnection.findFirst({
      where: {
        id: request.mailboxConnectionId,
        organizationId: request.organizationId,
        connectedByUserId: request.userId,
        provider: "GMAIL",
      },
    }),
    memberCanSend(request.organizationId, request.userId),
  ]);
  if (!member || !confirmation || !mailbox) {
    throw new SupplierGmailSendBlockedError("NOT_FOUND_OR_FORBIDDEN");
  }
  const prior = await prisma.supplierMailDelivery.findUnique({
    where: {
      organizationId_confirmationId: {
        organizationId: request.organizationId,
        confirmationId: confirmation.id,
      },
    },
  });
  return { confirmation, mailbox, prior };
}

function requireGmailSendAccess(request: { organizationId: string; userId: string }) {
  assertGmailAcceptanceEnrollment({
    organizationId: request.organizationId,
    userId: request.userId,
  });
  return gmailConnectionConfig();
}

async function reconcileWithPrisma(input: {
  claimId: string;
  organizationId: string;
  confirmationId: string;
  providerMessageId: string;
  providerThreadId: string;
}) {
  return reconcileAcceptedGmailDelivery({
    transaction: (fn) => prisma.$transaction(async (tx) => {
      const sentAt = new Date();
      return fn({
        updatePreparedConfirmation: async (target) => {
          const updated = await tx.supplierConfirmation.updateMany({
            where: {
              id: target.confirmationId,
              organizationId: target.organizationId,
              status: "PREPARED",
            },
            data: { status: "SENT" },
          });
          return updated.count;
        },
        updatePendingDelivery: async (target) => {
          const updated = await tx.supplierMailDelivery.updateMany({
            where: {
              id: target.claimId,
              organizationId: target.organizationId,
              status: "PENDING",
            },
            data: {
              status: target.status,
              providerMessageId: target.providerMessageId,
              providerThreadId: target.providerThreadId,
              ...(target.status === "SENT" ? { sentAt } : {}),
            },
          });
          return updated.count;
        },
      });
    }),
  }, input);
}

async function blockPendingWithReceipt(input: {
  claimId: string;
  organizationId: string;
  providerMessageId: string;
  providerThreadId: string;
}) {
  const updated = await prisma.supplierMailDelivery.updateMany({
    where: {
      id: input.claimId,
      organizationId: input.organizationId,
      status: "PENDING",
    },
    data: {
      status: "UNCERTAIN",
      providerMessageId: input.providerMessageId,
      providerThreadId: input.providerThreadId,
    },
  });
  if (updated.count !== 1) throw new Error("Gmail acceptance evidence was not stored.");
}

/** Fully server-generated preview. Never trust a browser-supplied body. */
export async function getSupplierGmailSendPreview(request: PreviewRequest) {
  requireGmailSendAccess(request);
  const { confirmation, mailbox, prior } = await lookupRequest(request);
  if (prior) {
    return {
      status: prior.status,
      from: prior.senderEmail,
      to: prior.recipientEmail,
      subject: prior.subject,
      approvalHash: null,
      body: null,
      providerMessageId: prior.providerMessageId,
      providerThreadId: prior.providerThreadId,
    };
  }
  const draft = snapshotFromRows({
    request,
    confirmation,
    mailbox,
    alreadyClaimed: false,
    explicitApproval: true,
    approvedHash: supplierMailApprovalHash({
      organizationId: request.organizationId,
      confirmationId: confirmation.id,
      mailboxConnectionId: mailbox.id,
      from: mailbox.mailboxEmail,
      to: request.recipient.trim().toLowerCase(),
      subject: confirmation.subject.trim(),
      body: currentOutboundTranslation(confirmation) ?? "",
    }),
  });
  return {
    status: "READY" as const,
    from: draft.from,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    approvalHash: draft.approvalHash,
    providerMessageId: null,
    providerThreadId: null,
  };
}

/**
 * One atomic claim, one Gmail call, no automatic retry.
 * A timeout or malformed provider response moves the claim to UNCERTAIN.
 */
export async function sendSupplierGmailInquiry(
  request: PreviewRequest & { approvedHash: string; explicitApproval: boolean },
  provider: GoogleGmailSendProvider = googleGmailSendProvider(),
) {
  const config = requireGmailSendAccess(request);
  if (!request.explicitApproval || !/^[a-f0-9]{64}$/i.test(request.approvedHash)) {
    throw new SupplierGmailSendBlockedError("APPROVAL_REQUIRED");
  }
  // Fail before reserving a durable attempt if identity cannot be resolved.
  await lookupRequest(request);
  const claimId = randomUUID();
  const rfcMessageId = `<${claimId}.jakov360@jakov360.com>`;

  let draft: OutboundSnapshot;
  try {
    draft = await prisma.$transaction(async (tx) => {
      const [confirmation, mailbox, member] = await Promise.all([
        tx.supplierConfirmation.findUnique({
          where: {
            organizationId_projectId_productUrl: {
              organizationId: request.organizationId,
              projectId: request.projectId,
              productUrl: canonicalSupplierProductUrl(request.productUrl),
            },
          },
        }),
        tx.mailboxConnection.findFirst({
          where: {
            id: request.mailboxConnectionId,
            organizationId: request.organizationId,
            connectedByUserId: request.userId,
            provider: "GMAIL",
          },
        }),
        tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: request.organizationId, userId: request.userId } },
          select: { role: true },
        }),
      ]);
      if (!confirmation || !mailbox || !member || !["OWNER", "ADMIN"].includes(member.role)) {
        throw new SupplierGmailSendBlockedError("NOT_FOUND_OR_FORBIDDEN");
      }
      const alreadyClaimed = Boolean(await tx.supplierMailDelivery.findUnique({
        where: {
          organizationId_confirmationId: {
            organizationId: request.organizationId,
            confirmationId: confirmation.id,
          },
        },
        select: { id: true },
      }));
      const candidate = snapshotFromRows({
        request,
        confirmation,
        mailbox,
        alreadyClaimed,
        approvedHash: request.approvedHash,
        explicitApproval: request.explicitApproval,
      });
      await tx.supplierMailDelivery.create({
        data: {
          id: claimId,
          organizationId: request.organizationId,
          confirmationId: confirmation.id,
          mailboxConnectionId: mailbox.id,
          sentByUserId: request.userId,
          senderEmail: candidate.from,
          recipientEmail: candidate.to,
          subject: candidate.subject,
          bodyHash: sha256(candidate.body),
          approvedHash: candidate.approvalHash,
          rfcMessageId,
          status: "PENDING",
        },
      });
      return candidate;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SupplierGmailSendBlockedError("ALREADY_SENT_OR_PENDING");
    }
    throw error;
  }

  const raw = encodeGmailTextMessage({
    from: draft.from,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    rfcMessageId,
  });
  let accepted: { providerMessageId: string; providerThreadId: string } | null = null;
  try {
    const refreshToken = decryptGmailRefreshToken(
      draft.encryptedToken,
      request.organizationId,
      draft.providerAccountId,
    );
    const receipt = await provider.send({
      refreshToken,
      raw,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    if (
      !receipt.providerMessageId ||
      !receipt.providerThreadId ||
      receipt.providerMessageId.length > 255 ||
      receipt.providerThreadId.length > 255
    ) {
      throw new SupplierGmailSendUncertainError();
    }
    const acceptedReceipt = {
      providerMessageId: receipt.providerMessageId,
      providerThreadId: receipt.providerThreadId,
    };
    accepted = acceptedReceipt;
    return await recordAcceptedGmailReceipt({
      claimId,
      organizationId: request.organizationId,
      confirmationId: draft.confirmationId,
      rfcMessageId,
      providerMessageId: acceptedReceipt.providerMessageId,
      providerThreadId: acceptedReceipt.providerThreadId,
    }, {
      reconcile: () => reconcileWithPrisma({
        claimId,
        organizationId: request.organizationId,
        confirmationId: draft.confirmationId,
        providerMessageId: acceptedReceipt.providerMessageId,
        providerThreadId: acceptedReceipt.providerThreadId,
      }),
      blockPending: () => blockPendingWithReceipt({
        claimId,
        organizationId: request.organizationId,
        providerMessageId: acceptedReceipt.providerMessageId,
        providerThreadId: acceptedReceipt.providerThreadId,
      }),
    });
  } catch (error) {
    // Provider acceptance is never retried. A handled receipt already kept
    // provider IDs on UNCERTAIN, or logged them when the database was down.
    if (accepted && error instanceof SupplierGmailSendUncertainError) throw error;
    await prisma.supplierMailDelivery.updateMany({
      where: { id: claimId, organizationId: request.organizationId, status: "PENDING" },
      data: { status: "UNCERTAIN" },
    }).catch(() => undefined);
    throw new SupplierGmailSendUncertainError();
  }
}
