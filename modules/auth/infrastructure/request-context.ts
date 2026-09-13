import type { NextRequest } from "next/server";

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function getRequestContext(request: NextRequest): RequestContext {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const host =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host;
  const protocol =
    firstForwardedValue(request.headers.get("x-forwarded-proto")) ||
    request.nextUrl.protocol.replace(/:$/, "");

  if (!host || !protocol) return false;

  try {
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
