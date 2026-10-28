import { afterEach, describe, expect, it } from "vitest";

import {
  getSupplierGmailSendPreview,
  gmailAcceptanceReconciliationEvidence,
  reconcileAcceptedGmailDelivery,
  recordAcceptedGmailReceipt,
  sendSupplierGmailInquiry,
  SupplierGmailSendUncertainError,
} from "../../modules/negotiation/application/supplier-gmail-send-service";
import {
  GmailAcceptanceDeniedError,
  GmailConnectNotConfiguredError,
} from "../../modules/negotiation/infrastructure/gmail-connect-oauth";

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const otherUser = "33333333-3333-4333-8333-333333333333";
const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const confirmationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const receipt = {
  providerMessageId: "gmail-message-accepted",
  providerThreadId: "gmail-thread-accepted",
};
const rfcMessageId = `<${claimId}.jakov360@jakov360.com>`;

const originalEnv = {
  RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
  JAKOV360_GMAIL_STAGING_ENABLED: process.env.JAKOV360_GMAIL_STAGING_ENABLED,
  JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID: process.env.JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID,
  JAKOV360_GMAIL_ACCEPTANCE_USER_IDS: process.env.JAKOV360_GMAIL_ACCEPTANCE_USER_IDS,
  JAKOV360_GMAIL_CLIENT_ID: process.env.JAKOV360_GMAIL_CLIENT_ID,
  JAKOV360_GMAIL_CLIENT_SECRET: process.env.JAKOV360_GMAIL_CLIENT_SECRET,
  JAKOV360_GMAIL_REDIRECT_URI: process.env.JAKOV360_GMAIL_REDIRECT_URI,
  APP_ORIGIN: process.env.APP_ORIGIN,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function stageEnv() {
  process.env.RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
  process.env.JAKOV360_GMAIL_STAGING_ENABLED = "true";
  process.env.JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID = org;
  process.env.JAKOV360_GMAIL_ACCEPTANCE_USER_IDS = user;
  process.env.JAKOV360_GMAIL_CLIENT_ID = "synthetic-client";
  process.env.JAKOV360_GMAIL_CLIENT_SECRET = "synthetic-secret";
  process.env.JAKOV360_GMAIL_REDIRECT_URI =
    "https://jakov360-acceptance-staging.onrender.com/api/mail/google/callback";
  process.env.APP_ORIGIN = "https://jakov360-acceptance-staging.onrender.com";
}

type RowState = {
  confirmationStatus: "PREPARED" | "SENT" | "RESPONSE_RECEIVED";
  deliveryStatus: "PENDING" | "SENT" | "UNCERTAIN";
};

function memoryDb(initial: RowState, options: { confirmationCount?: number; deliveryCount?: number } = {}) {
  let confirmationStatus = initial.confirmationStatus;
  let deliveryStatus = initial.deliveryStatus;
  let committed: RowState = { confirmationStatus, deliveryStatus };
  return {
    snapshot: () => ({ ...committed }),
    async blockPending() {
      if (committed.deliveryStatus !== "PENDING") {
        throw new Error("Gmail acceptance evidence was not stored.");
      }
      committed = { ...committed, deliveryStatus: "UNCERTAIN" };
    },
    transaction: async <T>(fn: (tx: {
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
    }) => Promise<T>) => {
      const backup = { confirmationStatus, deliveryStatus };
      try {
        const result = await fn({
          updatePreparedConfirmation: async () => {
            if (options.confirmationCount !== undefined) return options.confirmationCount;
            if (confirmationStatus !== "PREPARED") return 0;
            confirmationStatus = "SENT";
            return 1;
          },
          updatePendingDelivery: async (target) => {
            if (options.deliveryCount !== undefined) return options.deliveryCount;
            if (deliveryStatus !== "PENDING") return 0;
            deliveryStatus = target.status;
            return 1;
          },
        });
        committed = { confirmationStatus, deliveryStatus };
        return result;
      } catch (error) {
        confirmationStatus = backup.confirmationStatus;
        deliveryStatus = backup.deliveryStatus;
        throw error;
      }
    },
  };
}

const input = {
  claimId,
  organizationId: org,
  confirmationId,
  rfcMessageId,
  ...receipt,
};

describe("post-accept Gmail reconciliation", () => {
  it("marks SENT only when confirmation and delivery each update one row", async () => {
    const db = memoryDb({ confirmationStatus: "PREPARED", deliveryStatus: "PENDING" });
    const logs: unknown[] = [];
    const result = await recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(db, input),
      blockPending: () => db.blockPending(),
      log: (evidence) => logs.push(evidence),
    });
    expect(result).toEqual({ status: "SENT", ...receipt });
    expect(db.snapshot()).toEqual({ confirmationStatus: "SENT", deliveryStatus: "SENT" });
    expect(logs).toEqual([]);
  });

  it("never reports SENT when the confirmation update matches zero rows", async () => {
    const stillPrepared = memoryDb(
      { confirmationStatus: "PREPARED", deliveryStatus: "PENDING" },
      { confirmationCount: 0 },
    );
    const logs: unknown[] = [];
    await expect(recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(stillPrepared, input),
      blockPending: () => stillPrepared.blockPending(),
      log: (evidence) => logs.push(evidence),
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(stillPrepared.snapshot()).toEqual({
      confirmationStatus: "PREPARED",
      deliveryStatus: "UNCERTAIN",
    });
    expect(logs).toEqual([expect.objectContaining({ persisted: true, ...receipt })]);

    const manual = memoryDb({ confirmationStatus: "RESPONSE_RECEIVED", deliveryStatus: "PENDING" });
    await expect(recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(manual, input),
      blockPending: () => {
        throw new Error("blocked row was already updated inside the transaction");
      },
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(manual.snapshot()).toEqual({
      confirmationStatus: "RESPONSE_RECEIVED",
      deliveryStatus: "UNCERTAIN",
    });
  });

  it("rolls back a false SENT delivery when its update matches zero rows", async () => {
    const db = memoryDb(
      { confirmationStatus: "PREPARED", deliveryStatus: "PENDING" },
      { deliveryCount: 0 },
    );
    await expect(recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(db, input),
      blockPending: () => db.blockPending(),
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(db.snapshot()).toEqual({ confirmationStatus: "PREPARED", deliveryStatus: "UNCERTAIN" });
  });

  it("persists provider ids after an injected database failure and never returns SENT", async () => {
    const logs: unknown[] = [];
    let blocked = false;
    await expect(recordAcceptedGmailReceipt(input, {
      reconcile: async () => {
        throw new Error("injected post-accept database failure");
      },
      blockPending: async () => {
        blocked = true;
      },
      log: (evidence) => logs.push(evidence),
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(blocked).toBe(true);
    expect(logs).toEqual([expect.objectContaining({
      event: "gmail_send_reconciliation_required",
      persisted: true,
      rfcMessageId,
      ...receipt,
    })]);
  });

  it("logs reconcilable evidence without a body or token when the database stays down", async () => {
    const logs: ReturnType<typeof gmailAcceptanceReconciliationEvidence>[] = [];
    await expect(recordAcceptedGmailReceipt({
      ...input,
      rfcMessageId,
    }, {
      reconcile: async () => {
        throw new Error("database unavailable");
      },
      blockPending: async () => {
        throw new Error("database unavailable");
      },
      log: (evidence) => logs.push(evidence),
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(logs).toHaveLength(1);
    expect(Object.keys(logs[0]).sort()).toEqual([
      "claimId",
      "confirmationId",
      "event",
      "organizationId",
      "persisted",
      "providerMessageId",
      "providerThreadId",
      "rfcMessageId",
      "service",
    ]);
    const serialized = JSON.stringify(logs[0]);
    expect(serialized).toContain(rfcMessageId);
    expect(serialized).toContain("gmail-message-accepted");
    expect(serialized).not.toContain("refresh");
    expect(serialized).not.toContain("Please quote");
    expect(logs[0].persisted).toBe(false);
  });

  it("does not turn a second finalize of an already sent row into another SENT result", async () => {
    const db = memoryDb({ confirmationStatus: "PREPARED", deliveryStatus: "PENDING" });
    await recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(db, input),
      blockPending: () => db.blockPending(),
    });
    await expect(recordAcceptedGmailReceipt(input, {
      reconcile: () => reconcileAcceptedGmailDelivery(db, input),
      blockPending: () => db.blockPending(),
    })).rejects.toBeInstanceOf(SupplierGmailSendUncertainError);
    expect(db.snapshot()).toEqual({ confirmationStatus: "SENT", deliveryStatus: "SENT" });
  });
});

describe("send entry points deny actors outside the allowlist before Gmail", () => {
  it("does not preview, claim, or call Gmail for an unlisted admin or another organization", async () => {
    stageEnv();
    const request = {
      organizationId: org,
      userId: otherUser,
      projectId: confirmationId,
      productUrl: "https://example.test/catalog/item",
      mailboxConnectionId: claimId,
      recipient: "recipient@example.test",
    };
    let calls = 0;
    const provider = {
      async send() {
        calls += 1;
        return receipt;
      },
    };
    await expect(getSupplierGmailSendPreview(request)).rejects.toBeInstanceOf(GmailAcceptanceDeniedError);
    await expect(sendSupplierGmailInquiry({
      ...request,
      approvedHash: "a".repeat(64),
      explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(GmailAcceptanceDeniedError);
    await expect(getSupplierGmailSendPreview({
      ...request,
      organizationId: "44444444-4444-4444-8444-444444444444",
      userId: user,
    })).rejects.toBeInstanceOf(GmailAcceptanceDeniedError);
    expect(calls).toBe(0);
    delete process.env.JAKOV360_GMAIL_ACCEPTANCE_ORGANIZATION_ID;
    await expect(sendSupplierGmailInquiry({
      ...request,
      userId: user,
      approvedHash: "a".repeat(64),
      explicitApproval: true,
    }, provider)).rejects.toBeInstanceOf(GmailConnectNotConfiguredError);
    expect(calls).toBe(0);
  });
});
