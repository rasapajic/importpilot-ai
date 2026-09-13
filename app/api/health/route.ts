import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma";
import { getSupplierSearchProviderStatus } from "@/modules/product-search/infrastructure/provider";

export const HEALTH_DATABASE_TIMEOUT_MS = 2_500;

type DependencyStatus = "ok" | "error";

async function databaseStatus(): Promise<DependencyStatus> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("DATABASE_HEALTH_TIMEOUT")),
          HEALTH_DATABASE_TIMEOUT_MS,
        );
      }),
    ]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const [database, supplierSearchProvider] = await Promise.all([
    databaseStatus(),
    getSupplierSearchProviderStatus(),
  ]);
  const ready = database === "ok";

  return NextResponse.json({
    service: "importpilot-ai",
    status: ready ? "ok" : "error",
    database,
    ...(process.env.NODE_ENV === "development"
      ? { supplierSearchProvider }
      : {}),
  }, { status: ready ? 200 : 503 });
}
