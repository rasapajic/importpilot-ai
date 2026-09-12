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

function projectRedirect(request: NextRequest, projectId: string, error?: string) {
  const url = new URL(`/projects/${projectId}`, request.url);
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
): Promise<ProfitabilityRequestResult> {
  const auth = await authenticateRequest(request);
  if (!auth) return { kind: "UNAUTHENTICATED" };

  const decision = await checkProjectProfitability(
    projectId,
    auth.membership.organizationId,
  );
  return { kind: "SUCCESS", decision };
}

function logLifecycle(
  event: "completed" | "failed",
  projectId: string,
  startedAt: number,
  code?: string,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(JSON.stringify({
    service: "importpilot-web",
    event: `profitability_check_${event}`,
    projectId,
    durationMs: Date.now() - startedAt,
    ...(code ? { code } : {}),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const startedAt = Date.now();
  const { projectId } = await params;

  try {
    const result = await withProfitabilityTimeout(
      runProfitabilityRequest(request, projectId),
    );

    if (result.kind === "UNAUTHENTICATED") {
      logLifecycle("failed", projectId, startedAt, "UNAUTHENTICATED");
      if (acceptsHtml(request)) {
        const login = new URL("/login", request.url);
        login.searchParams.set("next", `/projects/${projectId}`);
        return NextResponse.redirect(login, 303);
      }
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    logLifecycle("completed", projectId, startedAt);
    return acceptsHtml(request)
      ? projectRedirect(request, projectId)
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

    logLifecycle("failed", projectId, startedAt, code);
    return acceptsHtml(request)
      ? projectRedirect(request, projectId, code)
      : NextResponse.json({ error: code }, { status });
  }
}
