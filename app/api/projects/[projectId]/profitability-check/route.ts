import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  checkProjectProfitability,
  ProfitabilityNoCalculatedOffersError,
  ProfitabilityProjectNotFoundError,
} from "@/modules/projects/application/profitability-check-service";

const PROFITABILITY_CHECK_TIMEOUT_MS = 14_000;

class ProfitabilityCheckTimeoutError extends Error {}

type ProfitabilityRequestResult =
  | { kind: "UNAUTHENTICATED" }
  | { kind: "SUCCESS"; decision: Awaited<ReturnType<typeof checkProjectProfitability>> };

function acceptsHtml(request: NextRequest) {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function projectRedirect(
  request: NextRequest,
  projectId: string,
  error?: string,
  offerId?: string,
) {
  const url = new URL(`/projects/${projectId}`, request.url);
  if (offerId) url.searchParams.set("selectedOffer", offerId);
  if (error) url.searchParams.set("profitabilityError", error);
  url.hash = "workflow-step-decision";
  return NextResponse.redirect(url, 303);
}

function withProfitabilityTimeout<T>(operation: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new ProfitabilityCheckTimeoutError()),
      PROFITABILITY_CHECK_TIMEOUT_MS,
    );
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function runProfitabilityRequest(
  request: NextRequest,
  projectId: string,
  offerId?: string,
): Promise<ProfitabilityRequestResult> {
  const auth = await authenticateRequest(request);
  if (!auth) return { kind: "UNAUTHENTICATED" };

  const decision = await checkProjectProfitability(
    projectId,
    auth.membership.organizationId,
    offerId,
  );
  return { kind: "SUCCESS", decision };
}

function logLifecycle(
  event: "completed" | "failed",
  projectId: string,
  startedAt: number,
  code?: string,
  offerId?: string,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({
    service: "importpilot-web",
    event: `profitability_check_${event}`,
    projectId,
    durationMs: Date.now() - startedAt,
    ...(offerId ? { offerId } : {}),
    ...(code ? { code } : {}),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const startedAt = Date.now();
  const { projectId } = await params;
  const offerId = request.nextUrl.searchParams.get("offerId") || undefined;

  try {
    const result = await withProfitabilityTimeout(
      runProfitabilityRequest(request, projectId, offerId),
    );

    if (result.kind === "UNAUTHENTICATED") {
      logLifecycle("failed", projectId, startedAt, "UNAUTHENTICATED", offerId);
      if (acceptsHtml(request)) {
        const login = new URL("/login", request.url);
        const next = new URL(`/projects/${projectId}`, request.url);
        if (offerId) next.searchParams.set("selectedOffer", offerId);
        login.searchParams.set("next", `${next.pathname}${next.search}`);
        return NextResponse.redirect(login, 303);
      }
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    logLifecycle("completed", projectId, startedAt, undefined, offerId);
    return acceptsHtml(request)
      ? projectRedirect(request, projectId, undefined, offerId)
      : NextResponse.json(result.decision, { status: 201 });
  } catch (error) {
    const code = error instanceof ProfitabilityNoCalculatedOffersError
      ? "NO_CALCULATED_OFFERS"
      : error instanceof ProfitabilityProjectNotFoundError
        ? "PROJECT_NOT_FOUND"
        : error instanceof ProfitabilityCheckTimeoutError
          ? "CHECK_TIMEOUT"
          : "CHECK_FAILED";
    const status = code === "PROJECT_NOT_FOUND"
      ? 404
      : code === "CHECK_FAILED" || code === "CHECK_TIMEOUT"
        ? 500
        : 400;

    logLifecycle("failed", projectId, startedAt, code, offerId);
    return acceptsHtml(request)
      ? projectRedirect(request, projectId, code, offerId)
      : NextResponse.json({ error: code }, { status });
  }
}