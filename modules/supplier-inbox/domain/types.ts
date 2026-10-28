import type { ProviderAuthenticationResult } from "@/modules/supplier-inbox/domain/sender-trust";

export type SyntheticProviderContext = {
  authenticated: boolean;
  provider: string;
  testDoubleId?: string;
};

export type SyntheticAttachment = {
  filename: string;
  declaredMime: string;
  bytes: Uint8Array;
};

export type SyntheticInboundEnvelope = {
  providerMessageId: string;
  recipient: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  receivedAt: string;
  inReplyTo?: string | null;
  references?: string[];
  rawAuthenticationResults?: string | null;
  claimedOrganizationId?: string | null;
  providerAuth?: ProviderAuthenticationResult | null;
  attachments?: SyntheticAttachment[];
};

export type SyntheticHandlerResult = {
  httpStatus: 200 | 400 | 401 | 403 | 413 | 500;
  stored: boolean;
  duplicate: boolean;
  quarantined: boolean;
  messageId: string | null;
  organizationId: string | null;
  threadId: string | null;
};

export function isSyntheticProviderContext(
  value: SyntheticProviderContext | null | undefined,
): value is { authenticated: true; provider: "synthetic"; testDoubleId: string } {
  return Boolean(
    value &&
      value.authenticated === true &&
      value.provider === "synthetic" &&
      typeof value.testDoubleId === "string" &&
      value.testDoubleId.length > 0,
  );
}

export type InboxAttachmentDto = {
  id: string;
  filename: string;
  declaredMime: string;
  detectedMime: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: "PENDING" | "CLEAN" | "REJECTED";
  rejectionReason: string | null;
  downloadAllowed: boolean;
};

export type InboxExtractionDto = {
  id: string;
  fieldKey: string;
  value: unknown;
  confidence: string;
  snippet: string;
  attachmentFilename: string | null;
  page: number | null;
  flag: string;
  reviewStatus: "UNREVIEWED" | "ACCEPTED" | "REJECTED";
};

export type InboxMessageDto = {
  id: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  senderTrust: "ALIGNED" | "UNVERIFIED";
  source: string;
  originalText: string;
  serbianText: string;
  translationModelId: string;
  attachments: InboxAttachmentDto[];
  extractions: InboxExtractionDto[];
};

export type InboxFollowUpDto = {
  id: string;
  status: string;
  subject: string;
  body: string;
  sentAt: string | null;
  approvalHash: string | null;
};

export type InboxEventDto = {
  id: string;
  type: string;
  createdAt: string;
  summary: string;
};

export type InboxThreadDto = {
  id: string;
  supplierName: string;
  status: string;
  orderedQuantity: number;
  ingestionDelayed: boolean;
  unverifiedSenderAcknowledged: boolean;
  confirmAllowed: boolean;
  confirmBlockedReason: string | null;
  appliedToCostEngine: false;
  commercialOrderPlaced: false;
  extractorModelId: string;
  messages: InboxMessageDto[];
  followUps: InboxFollowUpDto[];
  events: InboxEventDto[];
};

export type ProjectInboxDto = {
  projectId: string;
  receivingEnabled: boolean;
  threads: InboxThreadDto[];
};
