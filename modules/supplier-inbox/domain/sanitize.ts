export function sanitizeInboundText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/<[^>\n]+>/g, "")
    .replace(/https?:\/\/\S+/gi, "[remote-link-removed]");
}
