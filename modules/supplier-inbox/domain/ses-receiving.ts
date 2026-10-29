import { isInboundMailEnabled } from "@/modules/supplier-inbox/domain/feature-flag";
import {
  hashReplyToken,
  parseReplyRecipient,
  redactSecrets,
  replyRecipientRejection,
  sha256Hex,
  SYNTHETIC_REPLY_DOMAIN,
  untrustedReplyTokenCandidate,
} from "@/modules/supplier-inbox/domain/reply-token";
import { sanitizeInboundText } from "@/modules/supplier-inbox/domain/sanitize";
import { MAX_MESSAGE_BYTES, MAX_TEXT_CHARS, syntheticMalwareScan } from "@/modules/supplier-inbox/domain/attachment-policy";
import {
  snsNotificationStringToSign,
  snsSigningCertUrlAllowed,
  SNS_SIGNATURE_VERSION,
  verifySnsSignature,
} from "@/modules/supplier-inbox/domain/ses-signature";

/**
 * Fixture-only Amazon SES receiving preflight.
 * This module does not request gmail.readonly or gmail.metadata.
 * It does not read AWS credentials, publish DNS, or open a network connection.
 * A passing result is not a stored supplier message and not a verified quote.
 */

export const SES_PREFLIGHT_REGION = "eu-central-1" as const;
export const SES_INBOUND_SMTP_ENDPOINT = "inbound-smtp.eu-central-1.amazonaws.com";
export const SES_PUBLISHED_S3_MAX_BYTES = 40 * 1024 * 1024;
export const SES_NOTIFICATION_MAX_CHARS = 128 * 1024;
export const SES_ORIGINAL_KEY_PREFIX = "original-mime/";
export const PREFLIGHT_MAX_NOTICE_AGE_MS = 24 * 60 * 60 * 1000;
export const PREFLIGHT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Documented fixture. Not an AWS account, bucket, or topic that this repo owns. */
export const SES_PREFLIGHT_BINDING = {
  topicArn: "arn:aws:sns:eu-central-1:111122223333:jakov360-ses-inbound-preflight",
  receiptRuleArn:
    "arn:aws:ses:eu-central-1:111122223333:receipt-rule-set/jakov360-replies-preflight:receipt-rule/deliver-s3-original",
  bucket: "example-jakov360-ses-preflight",
  inboundDomain: SYNTHETIC_REPLY_DOMAIN,
} as const;

export type SesReceivingBinding = {
  topicArn: string;
  receiptRuleArn: string;
  bucket: string;
  inboundDomain: string;
};

export type PinnedSnsCertificate = {
  signingCertUrl: string;
  pem: string;
};

export type SesMimeFixture = {
  bytes?: Uint8Array;
  declaredByteLength?: number;
  text?: string;
};

export type SesVerdictStatus = "PASS" | "FAIL" | "GRAY" | "PROCESSING_FAILED";

export type SesEvidencePlan = {
  evidenceClass: "SES_S3_ORIGINAL_POINTER";
  bucket: string;
  objectKey: string;
  region: typeof SES_PREFLIGHT_REGION;
  sesMessageId: string;
  snsMessageId: string;
  expectedReceiptRuleArn: string;
  receiptRuleProvenByNotification: false;
  encryptionPlan: "SSE-KMS";
  sesClientSideEncryptionSelected: false;
  providerObjectBytesRead: false;
  providerObjectSha256: null;
  fixtureSha256: string | null;
  fixtureDigestIsNotTheProviderObject: true;
  malwareScan: "NOT_RUN" | "FIXTURE_CLEAN" | "FIXTURE_REJECTED";
  productionScanner: false;
  htmlMustBeSanitized: boolean;
  renderedTextSeparateFromOriginal: true;
  downloadAllowed: false;
  retentionImplemented: false;
};

export type SesPreflightResult = {
  ok: boolean;
  reason: string;
  statusCode: 200 | 400 | 401 | 403 | 413;
  duplicate: boolean;
  acceptedWorkRan: boolean;
  dedupKey: string | null;
  routingTokenHash: string | null;
  tokenUsedForLookup: false;
  organizationId: null;
  senderTrust: "UNVERIFIED" | null;
  spoofSuspected: boolean;
  headerRecipientIgnored: boolean;
  rawAuthenticationResultsUsed: false;
  receiptRuleProvenByNotification: false;
  verdicts: {
    spf: SesVerdictStatus;
    dkim: SesVerdictStatus;
    dmarc: SesVerdictStatus;
    spam: SesVerdictStatus;
    virus: SesVerdictStatus;
  } | null;
  evidence: SesEvidencePlan | null;
  renderedText: string | null;
  renderedEvidenceClass: "REDACTED_RENDERING" | null;
  quoteReviewStatus: "UNREVIEWED" | null;
  costEngineWrite: false;
  followUpSent: false;
  downloadAllowed: false;
  aiExtractionAllowed: false;
  liveNetwork: false;
  persisted: false;
  durableIdempotency: false;
};

const PREFLIGHT_MARKER = Symbol("jakov360.inProcessSesPreflight");

export type SesPreflightContext = {
  purpose: "ses-receiving-preflight";
  testDoubleId: string;
};

export function createSesPreflightContext(testDoubleId: string): SesPreflightContext {
  if (testDoubleId.trim().length === 0 || testDoubleId.length > 80) {
    throw new Error("SES preflight context requires an in-process test double id.");
  }
  const context: SesPreflightContext = {
    purpose: "ses-receiving-preflight",
    testDoubleId,
  };
  Object.defineProperty(context, PREFLIGHT_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return context;
}

export function isSesPreflightContext(value: unknown): value is SesPreflightContext {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<PropertyKey, unknown>;
  return (
    record[PREFLIGHT_MARKER] === true &&
    record.purpose === "ses-receiving-preflight" &&
    typeof record.testDoubleId === "string" &&
    record.testDoubleId.length > 0 &&
    record.testDoubleId.length <= 80
  );
}

export function assertSesPreflightBinding(binding: SesReceivingBinding): void {
  if (
    binding.topicArn !== SES_PREFLIGHT_BINDING.topicArn ||
    binding.receiptRuleArn !== SES_PREFLIGHT_BINDING.receiptRuleArn ||
    binding.bucket !== SES_PREFLIGHT_BINDING.bucket ||
    binding.inboundDomain !== SES_PREFLIGHT_BINDING.inboundDomain
  ) {
    throw new Error(
      "SES preflight binding is locked to the documented fixture. It cannot target a live account, bucket, or domain.",
    );
  }
}

type Slot = {
  status: "pending" | "done" | "failed";
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export type SesDeliveryGate = {
  claim(key: string, work: () => Promise<void>): Promise<"first" | "duplicate">;
};

/**
 * In-process single-flight lock. Two overlapping calls on one gate run the work once.
 * A second gate is not a distributed lock. Durable idempotency is a later database unique key.
 */
export function createSesDeliveryGate(): SesDeliveryGate {
  const slots = new Map<string, Slot>();
  const gate: SesDeliveryGate = {
    async claim(key, work) {
      const existing = slots.get(key);
      if (existing?.status === "done") return "duplicate";
      if (existing?.status === "pending") {
        try {
          await existing.promise;
          return "duplicate";
        } catch {
          return gate.claim(key, work);
        }
      }
      if (existing?.status === "failed") slots.delete(key);
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      promise.catch(() => undefined);
      const slot: Slot = { status: "pending", promise, resolve, reject };
      slots.set(key, slot);
      try {
        await work();
        slot.status = "done";
        resolve();
        return "first";
      } catch (error) {
        slot.status = "failed";
        reject(error);
        slots.delete(key);
        throw error;
      }
    },
  };
  return gate;
}

type ValidateInput = {
  snsMessage: unknown;
  pinnedCertificates: readonly PinnedSnsCertificate[];
  binding: SesReceivingBinding;
  now?: Date;
  mime?: SesMimeFixture;
};

export function validateSesReceivingNotice(input: ValidateInput): SesPreflightResult {
  assertSesPreflightBinding(input.binding);
  if (input.pinnedCertificates.length > 5) {
    throw new Error("SES preflight accepts at most five pinned certificates.");
  }
  const now = input.now ?? new Date();
  const sns = readSns(input.snsMessage);
  if (!sns.ok) return failure(sns.reason, sns.statusCode);
  if (sns.value.type === "SubscriptionConfirmation" || sns.value.type === "UnsubscribeConfirmation") {
    return failure("SUBSCRIPTION_CONTROL_REJECTED", 400);
  }
  if (sns.value.type !== "Notification") return failure("MALFORMED", 400);
  if (sns.value.signatureVersion !== SNS_SIGNATURE_VERSION) {
    return failure("SIGNATURE_VERSION_REJECTED", 400);
  }
  if (sns.value.message.length > SES_NOTIFICATION_MAX_CHARS) return failure("OVERSIZED", 413);
  if (!snsSigningCertUrlAllowed(sns.value.signingCertUrl)) {
    return failure("CERTIFICATE_URL_REJECTED", 400);
  }
  const pin = input.pinnedCertificates.find((item) => item.signingCertUrl === sns.value.signingCertUrl);
  if (!pin) return failure("CERTIFICATE_NOT_PINNED", 401);
  const signedAt = Date.parse(sns.value.timestamp);
  if (!Number.isFinite(signedAt)) return failure("MALFORMED", 400);
  const signature = verifySnsSignature({
    pem: pin.pem,
    stringToSign: snsNotificationStringToSign({
      Type: sns.value.type,
      Message: sns.value.message,
      MessageId: sns.value.messageId,
      Subject: sns.value.subject,
      Timestamp: sns.value.timestamp,
      TopicArn: sns.value.topicArn,
    }),
    signature: sns.value.signature,
    at: now,
    messageAt: new Date(signedAt),
  });
  if (signature === "unusable") return failure("CERTIFICATE_UNUSABLE", 401);
  if (signature !== "ok") return failure("FORGED_SIGNATURE", 401);
  if (sns.value.topicArn !== input.binding.topicArn) return failure("TOPIC_MISMATCH", 400);
  const skew = signedAt - now.getTime();
  if (skew > PREFLIGHT_MAX_FUTURE_SKEW_MS || now.getTime() - signedAt > PREFLIGHT_MAX_NOTICE_AGE_MS) {
    return failure("STALE_OR_FUTURE", 400);
  }
  return assessSignedSes(sns.value, input.binding, input.mime);
}

export async function admitSesReceivingNotice(input: ValidateInput & {
  context: unknown;
  env?: Record<string, string | undefined>;
  gate: SesDeliveryGate;
  onAccepted?: () => Promise<void> | void;
}): Promise<SesPreflightResult> {
  if (!isInboundMailEnabled(input.env ?? process.env)) {
    return failure("FLAG_DISABLED", 403);
  }
  if (!isSesPreflightContext(input.context)) {
    return failure("PROVIDER_CONTEXT_REQUIRED", 401);
  }
  const decision = validateSesReceivingNotice(input);
  if (!decision.ok || !decision.dedupKey) return decision;
  let ran = false;
  const claim = await input.gate.claim(decision.dedupKey, async () => {
    ran = true;
    await input.onAccepted?.();
  });
  if (claim === "duplicate") {
    return {
      ...decision,
      ok: false,
      reason: "DUPLICATE",
      statusCode: 200,
      duplicate: true,
      acceptedWorkRan: false,
      routingTokenHash: null,
      renderedText: null,
      renderedEvidenceClass: null,
      quoteReviewStatus: null,
    };
  }
  return { ...decision, acceptedWorkRan: ran };
}

type SnsValue = {
  type: string;
  messageId: string;
  topicArn: string;
  subject?: string;
  message: string;
  timestamp: string;
  signatureVersion: string;
  signature: string;
  signingCertUrl: string;
};

function readSns(value: unknown): { ok: true; value: SnsValue } | { ok: false; reason: string; statusCode: 400 | 413 } {
  let record = value;
  if (typeof record === "string") {
    if (record.length > 1_000_000) return { ok: false, reason: "OVERSIZED", statusCode: 413 };
    try {
      record = JSON.parse(record) as unknown;
    } catch {
      return { ok: false, reason: "MALFORMED", statusCode: 400 };
    }
  }
  if (!isRecord(record)) return { ok: false, reason: "MALFORMED", statusCode: 400 };
  const type = readBoundedString(record, "Type", 40);
  const messageId = readBoundedString(record, "MessageId", 80);
  const topicArn = readBoundedString(record, "TopicArn", 300);
  const message = readBoundedString(record, "Message", 1_000_000);
  const timestamp = readBoundedString(record, "Timestamp", 40);
  const signatureVersion = readBoundedString(record, "SignatureVersion", 4);
  const signature = readBoundedString(record, "Signature", 2000);
  const signingCertUrl = readBoundedString(record, "SigningCertURL", 300);
  if (!type || !messageId || !topicArn || !message || !timestamp || !signatureVersion || !signature || !signingCertUrl) {
    return { ok: false, reason: "MALFORMED", statusCode: 400 };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
    return { ok: false, reason: "MALFORMED", statusCode: 400 };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    return { ok: false, reason: "MALFORMED", statusCode: 400 };
  }
  let subject: string | undefined;
  if (Object.hasOwn(record, "Subject")) {
    const value = readBoundedString(record, "Subject", 500);
    if (typeof value !== "string") return { ok: false, reason: "MALFORMED", statusCode: 400 };
    subject = value;
  }
  return {
    ok: true,
    value: {
      type,
      messageId,
      topicArn,
      subject,
      message,
      timestamp,
      signatureVersion,
      signature,
      signingCertUrl,
    },
  };
}

function assessSignedSes(
  sns: SnsValue,
  binding: SesReceivingBinding,
  mime: SesMimeFixture | undefined,
): SesPreflightResult {
  let body: unknown;
  try {
    body = JSON.parse(sns.message) as unknown;
  } catch {
    return failure("MALFORMED", 400);
  }
  if (!isRecord(body)) return failure("MALFORMED", 400);
  if (Object.hasOwn(body, "content")) return failure("INLINE_MIME_REJECTED", 400);
  if (body.notificationType !== "Received") return failure("MALFORMED", 400);
  if (!isRecord(body.receipt) || !isRecord(body.mail)) return failure("MALFORMED", 400);
  const action = body.receipt.action;
  if (!isRecord(action) || action.type !== "S3") return failure("NOT_S3_ACTION", 400);
  if (action.topicArn !== binding.topicArn || action.bucketName !== binding.bucket) {
    return failure(action.topicArn === binding.topicArn ? "BUCKET_MISMATCH" : "TOPIC_MISMATCH", 400);
  }
  const sesMessageId = readBoundedString(body.mail, "messageId", 80);
  if (!sesMessageId || !/^[A-Za-z0-9]{16,80}$/.test(sesMessageId)) return failure("MALFORMED", 400);
  const objectKey = `${SES_ORIGINAL_KEY_PREFIX}${sesMessageId}`;
  if (action.objectKey !== objectKey) return failure("OBJECT_KEY_REJECTED", 400);
  if (body.mail.headersTruncated !== false) return failure("HEADERS_TRUNCATED", 400);
  if (typeof body.mail.source !== "string" || !body.mail.source.includes("@") || body.mail.source.length > 320) {
    return failure("MALFORMED", 400);
  }
  const verdicts = readVerdicts(body.receipt);
  if (!verdicts) return failure("MALFORMED", 400);
  const recipients = readStringList(body.receipt.recipients, 10);
  if (!recipients) return failure("MALFORMED", 400);
  const headers = headerAddresses(body.mail);
  if (!headers) return failure("MALFORMED", 400);
  const route = routeRecipients(recipients, headers);
  const base = {
    dedupKey: `ses:${SES_PREFLIGHT_REGION}:111122223333:${sesMessageId}`,
    spoofSuspected: spoofSuspected(body.mail, verdicts),
    headerRecipientIgnored: route.headerRecipientIgnored,
    verdicts,
    evidence: evidencePlan({
      snsMessageId: sns.messageId,
      sesMessageId,
      objectKey,
      fixtureSha256: null,
      malwareScan: "NOT_RUN",
      htmlMustBeSanitized: false,
    }),
  };
  if (route.reason) {
    return failure(route.reason, 400, { ...base, evidence: { ...base.evidence, malwareScan: "NOT_RUN" } });
  }
  if (verdicts.virus === "FAIL") {
    return failure("VIRUS_VERDICT_FAIL", 400, base);
  }
  if (verdicts.spam === "FAIL") {
    return failure("SPAM_VERDICT_HOLD", 400, base);
  }
  const inspected = inspectMime(mime, route.token as string);
  if (!inspected.ok) {
    return failure(inspected.reason, inspected.statusCode, {
      ...base,
      evidence: {
        ...base.evidence,
        malwareScan: inspected.reason === "UNSAFE_MIME" ? "FIXTURE_REJECTED" : "NOT_RUN",
      },
    });
  }
  return {
    ...successSkeleton(),
    dedupKey: base.dedupKey,
    routingTokenHash: hashReplyToken(route.token as string),
    senderTrust: "UNVERIFIED",
    spoofSuspected: base.spoofSuspected,
    headerRecipientIgnored: base.headerRecipientIgnored,
    verdicts,
    evidence: {
      ...base.evidence,
      fixtureSha256: inspected.fixtureSha256,
      malwareScan: inspected.malwareScan,
      htmlMustBeSanitized: inspected.htmlMustBeSanitized,
    },
    renderedText: inspected.renderedText,
    renderedEvidenceClass: inspected.renderedText === null ? null : "REDACTED_RENDERING",
    quoteReviewStatus: "UNREVIEWED",
  };
}

function routeRecipients(recipients: string[], headers: string[]): {
  reason: string | null;
  token: string | null;
  headerRecipientIgnored: boolean;
} {
  const rejections = recipients.map((recipient) => replyRecipientRejection(recipient, SYNTHETIC_REPLY_DOMAIN));
  if (rejections.some((reason) => reason === "UNCONFIGURED_DOMAIN")) {
    return { reason: "UNCONFIGURED_DOMAIN", token: null, headerRecipientIgnored: headersMentionToken(headers, null) };
  }
  if (rejections.some((reason) => reason !== null)) {
    return { reason: "MALFORMED_RECIPIENT", token: null, headerRecipientIgnored: headersMentionToken(headers, null) };
  }
  const tokens = recipients.map((recipient) => parseReplyRecipient(recipient, SYNTHETIC_REPLY_DOMAIN));
  if (tokens.some((token) => token === null)) {
    return { reason: "MALFORMED_RECIPIENT", token: null, headerRecipientIgnored: false };
  }
  const unique = new Set(tokens);
  if (unique.size !== 1) {
    return { reason: "AMBIGUOUS_RECIPIENTS", token: null, headerRecipientIgnored: true };
  }
  const token = tokens[0] as string;
  return { reason: null, token, headerRecipientIgnored: headersMentionToken(headers, token) };
}

function headersMentionToken(headers: string[], envelopeToken: string | null): boolean {
  return headers.some((header) => {
    const token = parseReplyRecipient(header, SYNTHETIC_REPLY_DOMAIN) ?? untrustedReplyTokenCandidate(header);
    return token !== null && token !== envelopeToken;
  });
}

function headerAddresses(mail: Record<string, unknown>): string[] | null {
  if (!isRecord(mail.commonHeaders)) return null;
  const destination = optionalStringList(mail, "destination");
  const to = optionalStringList(mail.commonHeaders, "to");
  const cc = optionalStringList(mail.commonHeaders, "cc");
  if (!destination || !to || !cc) return null;
  return [...destination, ...to, ...cc];
}

function optionalStringList(record: Record<string, unknown>, key: string): string[] | null {
  if (!Object.hasOwn(record, key) || record[key] === undefined) return [];
  return readStringList(record[key], 20);
}

function spoofSuspected(
  mail: Record<string, unknown>,
  verdicts: NonNullable<SesPreflightResult["verdicts"]>,
): boolean {
  const source = typeof mail.source === "string" ? domainOf(mail.source) : null;
  const fromList = isRecord(mail.commonHeaders) ? readStringList(mail.commonHeaders.from, 5) : null;
  const from = fromList && fromList.length > 0 ? domainOf(fromList[0]) : null;
  return Boolean(
    (source && from && source !== from) ||
    verdicts.spf === "FAIL" ||
    verdicts.dkim === "FAIL" ||
    verdicts.dmarc === "FAIL",
  );
}

function inspectMime(mime: SesMimeFixture | undefined, token: string): {
  ok: true;
  fixtureSha256: string | null;
  malwareScan: "NOT_RUN" | "FIXTURE_CLEAN";
  htmlMustBeSanitized: boolean;
  renderedText: string | null;
} | { ok: false; reason: "OVERSIZED" | "UNSAFE_MIME" | "MALFORMED"; statusCode: 400 | 413 } {
  const cap = Math.min(MAX_MESSAGE_BYTES, SES_PUBLISHED_S3_MAX_BYTES);
  const declared = mime?.declaredByteLength;
  const bytes = mime?.bytes;
  if (declared !== undefined && (!Number.isSafeInteger(declared) || declared < 0)) {
    return { ok: false, reason: "MALFORMED", statusCode: 400 };
  }
  if (bytes && declared !== undefined && declared !== bytes.byteLength) {
    return { ok: false, reason: "MALFORMED", statusCode: 400 };
  }
  const size = bytes?.byteLength ?? declared;
  if (size !== undefined && size > cap) return { ok: false, reason: "OVERSIZED", statusCode: 413 };
  if (mime?.text !== undefined && mime.text.length > MAX_TEXT_CHARS) {
    return { ok: false, reason: "OVERSIZED", statusCode: 413 };
  }
  if (bytes && unsafeMime(bytes)) return { ok: false, reason: "UNSAFE_MIME", statusCode: 400 };
  const renderedText = mime?.text === undefined ? null : sanitizeInboundText(redactSecrets(mime.text, [token]));
  const htmlMustBeSanitized = bytes ? latin1Preview(bytes).toLowerCase().includes("content-type: text/html") : false;
  return {
    ok: true,
    fixtureSha256: bytes ? sha256Hex(bytes) : null,
    malwareScan: bytes ? "FIXTURE_CLEAN" : "NOT_RUN",
    htmlMustBeSanitized,
    renderedText,
  };
}

function unsafeMime(bytes: Uint8Array): boolean {
  if (syntheticMalwareScan(bytes) === "REJECTED") return true;
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return true;
  }
  const preview = latin1Preview(bytes).toLowerCase();
  return /filename="[^"]+\.(exe|html|htm|svg|js|zip|xlsm|docm)"/.test(preview);
}

function evidencePlan(input: {
  snsMessageId: string;
  sesMessageId: string;
  objectKey: string;
  fixtureSha256: string | null;
  malwareScan: SesEvidencePlan["malwareScan"];
  htmlMustBeSanitized: boolean;
}): SesEvidencePlan {
  return {
    evidenceClass: "SES_S3_ORIGINAL_POINTER",
    bucket: SES_PREFLIGHT_BINDING.bucket,
    objectKey: input.objectKey,
    region: SES_PREFLIGHT_REGION,
    sesMessageId: input.sesMessageId,
    snsMessageId: input.snsMessageId,
    expectedReceiptRuleArn: SES_PREFLIGHT_BINDING.receiptRuleArn,
    receiptRuleProvenByNotification: false,
    encryptionPlan: "SSE-KMS",
    sesClientSideEncryptionSelected: false,
    providerObjectBytesRead: false,
    providerObjectSha256: null,
    fixtureSha256: input.fixtureSha256,
    fixtureDigestIsNotTheProviderObject: true,
    malwareScan: input.malwareScan,
    productionScanner: false,
    htmlMustBeSanitized: input.htmlMustBeSanitized,
    renderedTextSeparateFromOriginal: true,
    downloadAllowed: false,
    retentionImplemented: false,
  };
}

function readVerdicts(receipt: Record<string, unknown>): SesPreflightResult["verdicts"] {
  const spf = verdictStatus(receipt.spfVerdict);
  const dkim = verdictStatus(receipt.dkimVerdict);
  const dmarc = verdictStatus(receipt.dmarcVerdict);
  const spam = verdictStatus(receipt.spamVerdict);
  const virus = verdictStatus(receipt.virusVerdict);
  if (!spf || !dkim || !dmarc || !spam || !virus) return null;
  return { spf, dkim, dmarc, spam, virus };
}

function verdictStatus(value: unknown): SesVerdictStatus | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  if (value.status === "PASS" || value.status === "FAIL" || value.status === "GRAY" || value.status === "PROCESSING_FAILED") {
    return value.status;
  }
  return null;
}

function successSkeleton(): SesPreflightResult {
  return {
    ...failure("OK", 200),
    ok: true,
    senderTrust: "UNVERIFIED",
  };
}

function failure(
  reason: string,
  statusCode: SesPreflightResult["statusCode"],
  extra: Partial<SesPreflightResult> = {},
): SesPreflightResult {
  return {
    ok: false,
    reason,
    statusCode,
    duplicate: false,
    acceptedWorkRan: false,
    dedupKey: null,
    routingTokenHash: null,
    senderTrust: extra.senderTrust ?? (extra.verdicts ? "UNVERIFIED" : null),
    spoofSuspected: false,
    headerRecipientIgnored: false,
    verdicts: null,
    evidence: null,
    renderedText: null,
    renderedEvidenceClass: null,
    quoteReviewStatus: null,
    ...extra,
    tokenUsedForLookup: false,
    organizationId: null,
    rawAuthenticationResultsUsed: false,
    receiptRuleProvenByNotification: false,
    costEngineWrite: false,
    followUpSent: false,
    downloadAllowed: false,
    aiExtractionAllowed: false,
    liveNetwork: false,
    persisted: false,
    durableIdempotency: false,
  };
}

function domainOf(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return null;
  return address.slice(at + 1).trim().toLowerCase();
}

function readStringList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > 998) return null;
    items.push(item);
  }
  return items;
}

function readBoundedString(record: Record<string, unknown>, key: string, max: number): string | null | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || value.length > max) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function latin1Preview(bytes: Uint8Array): string {
  return Buffer.from(bytes.subarray(0, 8192)).toString("latin1");
}
