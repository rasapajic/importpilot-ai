import { createVerify, X509Certificate } from "node:crypto";

/**
 * Offline SNS signature check for the SES receiving preflight.
 * The certificate is supplied by the caller. This module does not perform an HTTP request.
 * SignatureVersion 1 (SHA-1) is rejected.
 */

export const SNS_SIGNATURE_VERSION = "2";

const CERT_URL_REGION = "eu-central-1";

export type SnsNotificationFields = {
  Type: string;
  Message: string;
  MessageId: string;
  Subject?: string;
  Timestamp: string;
  TopicArn: string;
};

/**
 * Canonical string for an SNS Notification, SignatureVersion 2.
 * Field order follows the AWS SNS signature documentation:
 * Message, MessageId, Subject if present, Timestamp, TopicArn, Type.
 * Each field is `name`, newline, value, newline.
 */
export function snsNotificationStringToSign(message: SnsNotificationFields): string {
  if (message.Type !== "Notification") {
    throw new Error("Only an SNS Notification has a preflight string to sign.");
  }
  const lines = [
    "Message",
    message.Message,
    "MessageId",
    message.MessageId,
  ];
  if (typeof message.Subject === "string") {
    lines.push("Subject", message.Subject);
  }
  lines.push(
    "Timestamp",
    message.Timestamp,
    "TopicArn",
    message.TopicArn,
    "Type",
    message.Type,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Allow only the Frankfurt SNS certificate host and the AWS filename shape.
 * A matching pin cannot widen this allowlist. The URL is not retrieved.
 */
export function snsSigningCertUrlAllowed(url: string): boolean {
  if (url.length === 0 || url.length > 300) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== `sns.${CERT_URL_REGION}.amazonaws.com`) return false;
  if (!/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(parsed.pathname)) return false;
  return url === `https://sns.${CERT_URL_REGION}.amazonaws.com${parsed.pathname}`;
}

export function verifySnsSignature(input: {
  pem: string;
  stringToSign: string;
  signature: string;
  at: Date;
  messageAt: Date;
}): "ok" | "unusable" | "forged" {
  if (input.signature.length === 0 || input.signature.length > 2000) return "forged";
  if (!/^[A-Za-z0-9+/=]+$/.test(input.signature)) return "forged";
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(input.pem);
  } catch {
    return "unusable";
  }
  if (certificate.publicKey.asymmetricKeyType !== "rsa") return "unusable";
  const modulus = certificate.publicKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (modulus < 2048) return "unusable";
  const from = Date.parse(certificate.validFrom);
  const to = Date.parse(certificate.validTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "unusable";
  const at = input.at.getTime();
  const messageAt = input.messageAt.getTime();
  if (at < from || at > to || messageAt < from || messageAt > to) return "unusable";
  const verifier = createVerify("RSA-SHA256");
  verifier.update(input.stringToSign);
  verifier.end();
  try {
    return verifier.verify(certificate.publicKey, input.signature, "base64") ? "ok" : "forged";
  } catch {
    return "forged";
  }
}
