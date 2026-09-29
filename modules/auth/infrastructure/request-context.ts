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

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin === request.nextUrl.origin) return true;

  const configuredOrigin = getConfiguredProxyOrigin();
  if (!configuredOrigin || origin !== configuredOrigin.origin) return false;

  const forwardedHost = getSingleForwardedValue(request, "x-forwarded-host");
  const forwardedProto = getSingleForwardedValue(request, "x-forwarded-proto");

  return (
    forwardedHost === configuredOrigin.host &&
    forwardedProto === configuredOrigin.protocol
  );
}

function getConfiguredProxyOrigin() {
  const value = process.env.AUTH_TRUSTED_PROXY_ORIGIN;
  if (!value || value !== value.trim() || value.includes("*")) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      !url.hostname.endsWith(".onrender.com")
    ) {
      return null;
    }

    return {
      origin: url.origin,
      host: url.host,
      protocol: url.protocol.slice(0, -1),
    };
  } catch {
    return null;
  }
}

function getSingleForwardedValue(
  request: NextRequest,
  headerName: "x-forwarded-host" | "x-forwarded-proto",
) {
  const value = request.headers.get(headerName);
  if (!value || value !== value.trim() || value.includes(",")) return null;
  return value;
}
