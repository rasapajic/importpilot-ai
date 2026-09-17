import { NextRequest, NextResponse } from "next/server";

export function isNativeAuthFormPost(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data");
}

export async function readAuthRequestBody(request: NextRequest, nativeForm: boolean) {
  if (!nativeForm) return request.json().catch(() => null);
  const formData = await request.formData().catch(() => null);
  return formData ? Object.fromEntries(formData.entries()) : null;
}

function publicOrigin(request: NextRequest) {
  for (const candidate of [
    process.env.APP_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    request.nextUrl.origin,
  ]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Continue to the next trusted candidate.
    }
  }
  return request.nextUrl.origin;
}

export function nativeAuthRedirect(
  request: NextRequest,
  path: "/login" | "/register" | "/dashboard",
  errorCode?: string,
) {
  const url = new URL(path, publicOrigin(request));
  if (errorCode) url.searchParams.set("authError", errorCode);
  return NextResponse.redirect(url, 303);
}
