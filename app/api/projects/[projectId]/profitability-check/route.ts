import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  checkProjectProfitability,
  ProfitabilityNoCalculatedOffersError,
  ProfitabilityProjectNotFoundError,
} from "@/modules/projects/application/profitability-check-service";

const PROFITABILITY_CHECK_TIMEOUT_MS = 15_000;

class ProfitabilityCheckTimeoutError extends Error {}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) {
    if (acceptsHtml(request)) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `/projects/${projectId}`);
      return NextResponse.redirect(login, 303);
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const decision = await withProfitabilityTimeout(
      checkProjectProfitability(
        projectId,
        auth.membership.organizationId,
      ),
    );
    return acceptsHtml(request)
      ? projectRedirect(request, projectId)
      : NextResponse.json(decision, { status: 201 });
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
    return acceptsHtml(request)
      ? projectRedirect(request, projectId, code)
      : NextResponse.json({ error: code }, { status });
  }
}
