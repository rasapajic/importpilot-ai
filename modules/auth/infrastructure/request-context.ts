import type { NextRequest } from "next/server";

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function getRequestContext(request: NextRequest): RequestContext {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(request: NextRequest) {
  const requestOrigin = normalizeOrigin(request.headers.get("origin"));
  if (!requestOrigin) return false;

  const allowedOrigins = new Set(
    [
      normalizeOrigin(request.nextUrl.origin),
      normalizeOrigin(process.env.APP_ORIGIN),
      normalizeOrigin(process.env.RENDER_EXTERNAL_URL),
    ].filter((origin): origin is string => Boolean(origin)),
  );

  return allowedOrigins.has(requestOrigin);
}
