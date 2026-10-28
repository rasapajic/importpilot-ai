export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const MAX_TEXT_CHARS = 100_000;

export type AttachmentClassification = {
  allowed: boolean;
  detectedMime: string;
  reason: string | null;
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function asLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

export function safeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "attachment";
  const cleaned = base.replace(/[^\w.\- ]+/g, "").trim().slice(0, 200);
  return cleaned || "attachment";
}

export function classifyAttachment(input: {
  filename: string;
  declaredMime: string;
  bytes: Uint8Array;
}): AttachmentClassification {
  const filename = safeFilename(input.filename).toLowerCase();
  const declared = input.declaredMime.trim().toLowerCase();
  const text = asLatin1(input.bytes.slice(0, 256)).toLowerCase();

  if (
    filename.endsWith(".svg") ||
    declared.includes("svg") ||
    text.includes("<svg")
  ) {
    return { allowed: false, detectedMime: "image/svg+xml", reason: "SVG_DENIED" };
  }
  if (
    filename.endsWith(".html") ||
    filename.endsWith(".htm") ||
    declared.includes("html") ||
    text.includes("<html") ||
    text.includes("<script")
  ) {
    return { allowed: false, detectedMime: "text/html", reason: "HTML_DENIED" };
  }
  if (filename.endsWith(".xlsm") || filename.endsWith(".docm") || declared.includes("macro")) {
    return { allowed: false, detectedMime: declared || "application/octet-stream", reason: "MACRO_DENIED" };
  }
  if (filename.endsWith(".zip") || (declared.includes("zip") && !filename.endsWith(".xlsx"))) {
    return { allowed: false, detectedMime: "application/zip", reason: "ZIP_NOT_UNPACKED" };
  }
  if (startsWith(input.bytes, [0x4d, 0x5a]) || filename.endsWith(".exe")) {
    return { allowed: false, detectedMime: "application/octet-stream", reason: "EXECUTABLE_DENIED" };
  }
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    return { allowed: false, detectedMime: declared || "application/octet-stream", reason: "FILE_TOO_LARGE" };
  }

  if (startsWith(input.bytes, [0x25, 0x50, 0x44, 0x46]) && filename.endsWith(".pdf") && declared === "application/pdf") {
    return { allowed: true, detectedMime: "application/pdf", reason: null };
  }
  if (
    startsWith(input.bytes, [0x89, 0x50, 0x4e, 0x47]) &&
    filename.endsWith(".png") &&
    declared === "image/png"
  ) {
    return { allowed: true, detectedMime: "image/png", reason: null };
  }
  if (startsWith(input.bytes, [0xff, 0xd8, 0xff]) && /\.jpe?g$/.test(filename) && declared === "image/jpeg") {
    return { allowed: true, detectedMime: "image/jpeg", reason: null };
  }
  if (
    startsWith(input.bytes, [0x52, 0x49, 0x46, 0x46]) &&
    asLatin1(input.bytes.slice(8, 12)) === "WEBP" &&
    filename.endsWith(".webp") &&
    declared === "image/webp"
  ) {
    return { allowed: true, detectedMime: "image/webp", reason: null };
  }
  if (
    startsWith(input.bytes, [0x50, 0x4b, 0x03, 0x04]) &&
    filename.endsWith(".xlsx") &&
    declared === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return { allowed: true, detectedMime: declared, reason: null };
  }
  if (
    filename.endsWith(".csv") &&
    declared === "text/csv" &&
    !input.bytes.includes(0)
  ) {
    return { allowed: true, detectedMime: "text/csv", reason: null };
  }

  return {
    allowed: false,
    detectedMime: declared || "application/octet-stream",
    reason: "UNKNOWN_OR_MISMATCHED_TYPE",
  };
}

/** In-process fixture scanner. This is not ClamAV and it does not call a network service. */
export function syntheticMalwareScan(bytes: Uint8Array): "CLEAN" | "REJECTED" {
  const text = asLatin1(bytes);
  if (text.includes("SYNTHETIC_MALWARE") || text.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return "REJECTED";
  }
  return "CLEAN";
}

export function canDownloadAttachment(scanStatus: string): boolean {
  return scanStatus === "CLEAN";
}

export function attachmentText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1").replace(/\0/g, "");
}

export function syntheticPdf(text: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${text}\n%%EOF\n`);
}
