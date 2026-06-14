import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  getAuthMetrics,
  MetricsAccessDeniedError,
} from "@/modules/auth/application/auth-metrics";
import { SESSION_COOKIE } from "@/modules/auth/domain/constants";

export async function GET() {
  let metrics;
  try {
    metrics = await getAuthMetrics((await cookies()).get(SESSION_COOKIE)?.value);
  } catch (error) {
    if (error instanceof MetricsAccessDeniedError) {
      return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
    }
    throw error;
  }
  const body = [
    "# TYPE auth_success_total counter",
    `auth_success_total ${metrics.success}`,
    "# TYPE auth_failed_total counter",
    `auth_failed_total ${metrics.failed}`,
    "# TYPE active_sessions gauge",
    `active_sessions ${metrics.active}`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
