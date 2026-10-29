import { execFileSync } from "node:child_process";
import { createSign, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replyToAddress } from "@/modules/supplier-inbox/domain/reply-token";
import {
  SES_ORIGINAL_KEY_PREFIX,
  SES_PREFLIGHT_BINDING,
  type SesVerdictStatus,
} from "@/modules/supplier-inbox/domain/ses-receiving";
import { snsNotificationStringToSign } from "@/modules/supplier-inbox/domain/ses-signature";

export const FIXTURE_CERT_URL =
  "https://sns.eu-central-1.amazonaws.com/SimpleNotificationService-preflightfixture.pem";

export type FixtureMaterial = {
  pem: string;
  privateKeyPem: string;
  certUrl: string;
  timestamp: string;
  now: Date;
};

type Verdicts = Record<"spf" | "dkim" | "dmarc" | "spam" | "virus", SesVerdictStatus>;

const PASSING: Verdicts = {
  spf: "PASS",
  dkim: "PASS",
  dmarc: "PASS",
  spam: "PASS",
  virus: "PASS",
};

export function createFixtureMaterial(): FixtureMaterial {
  const directory = mkdtempSync(join(tmpdir(), "ses-preflight-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  try {
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "3",
      "-nodes",
      "-subj",
      "/CN=sns-preflight-fixture.example.test",
    ], { stdio: "ignore" });
    const pem = readFileSync(certPath, "utf8");
    const privateKeyPem = readFileSync(keyPath, "utf8");
    const certificate = new X509Certificate(pem);
    const timestampDate = new Date(Date.parse(certificate.validFrom) + 60_000);
    return {
      pem,
      privateKeyPem,
      certUrl: FIXTURE_CERT_URL,
      timestamp: timestampDate.toISOString(),
      now: timestampDate,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function signUtf8(value: string, privateKeyPem: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(value);
  signer.end();
  return signer.sign(privateKeyPem).toString("base64");
}

export function sesFixtureBody(input: {
  token: string;
  messageId?: string;
  recipients?: string[];
  bucket?: string;
  objectKey?: string | null;
  actionType?: string;
  actionTopicArn?: string;
  source?: string;
  from?: string;
  destination?: string[];
  to?: string[];
  subject?: string;
  verdicts?: Partial<Verdicts>;
  headersTruncated?: boolean;
  includeContent?: string;
  authenticationResults?: string;
}): Record<string, unknown> {
  const messageId = input.messageId ?? "d6iitobk75ur44p8kdnnp7g2n800";
  const verdicts = { ...PASSING, ...input.verdicts };
  const recipient = input.recipients ?? [replyToAddress(input.token)];
  const source = input.source ?? "sales@wenzhou-glasses.example.test";
  const from = input.from ?? source;
  const body: Record<string, unknown> = {
    notificationType: "Received",
    receipt: {
      timestamp: "2026-10-29T12:00:00.000Z",
      processingTimeMillis: 222,
      recipients: recipient,
      spamVerdict: { status: verdicts.spam },
      virusVerdict: { status: verdicts.virus },
      spfVerdict: { status: verdicts.spf },
      dkimVerdict: { status: verdicts.dkim },
      dmarcVerdict: { status: verdicts.dmarc },
      action: {
        type: input.actionType ?? "S3",
        topicArn: input.actionTopicArn ?? SES_PREFLIGHT_BINDING.topicArn,
        bucketName: input.bucket ?? SES_PREFLIGHT_BINDING.bucket,
        objectKey: input.objectKey === undefined ? `${SES_ORIGINAL_KEY_PREFIX}${messageId}` : input.objectKey,
      },
    },
    mail: {
      timestamp: "2026-10-29T12:00:00.000Z",
      source,
      messageId,
      destination: input.destination ?? [from],
      headersTruncated: input.headersTruncated ?? false,
      headers: [
        { name: "From", value: from },
        { name: "Authentication-Results", value: input.authenticationResults ?? "dmarc=pass" },
      ],
      commonHeaders: {
        from: [from],
        to: input.to ?? [from],
        subject: input.subject ?? "Quote for 1000 non-progressive reading glasses",
      },
    },
  };
  if (input.includeContent !== undefined) body.content = input.includeContent;
  return body;
}

export function signedSnsNotification(
  material: FixtureMaterial,
  input: {
    token: string;
    ses?: Record<string, unknown>;
    topicArn?: string;
    type?: string;
    signatureVersion?: string;
    signingCertUrl?: string;
    timestamp?: string;
    snsMessageId?: string;
    subject?: string | null;
    privateKeyPem?: string;
    tamperSignature?: boolean;
  } & Parameters<typeof sesFixtureBody>[0],
): Record<string, unknown> {
  const topicArn = input.topicArn ?? SES_PREFLIGHT_BINDING.topicArn;
  const timestamp = input.timestamp ?? material.timestamp;
  const message = JSON.stringify(input.ses ?? sesFixtureBody(input));
  const fields = {
    Type: input.type ?? "Notification",
    MessageId: input.snsMessageId ?? "11111111-1111-4111-8111-111111111111",
    TopicArn: topicArn,
    Message: message,
    Timestamp: timestamp,
    ...(input.subject === null ? {} : { Subject: input.subject ?? "SES receipt" }),
  };
  const signature = input.type && input.type !== "Notification"
    ? "not-checked"
    : signUtf8(
      snsNotificationStringToSign({
        Type: "Notification",
        Message: fields.Message,
        MessageId: fields.MessageId,
        Subject: "Subject" in fields ? fields.Subject : undefined,
        Timestamp: fields.Timestamp,
        TopicArn: fields.TopicArn,
      }),
      input.privateKeyPem ?? material.privateKeyPem,
    );
  const notice: Record<string, unknown> = {
    ...fields,
    SignatureVersion: input.signatureVersion ?? "2",
    Signature: input.tamperSignature ? `${signature.slice(0, -2)}aa` : signature,
    SigningCertURL: input.signingCertUrl ?? material.certUrl,
  };
  return notice;
}
