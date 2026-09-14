import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma";
import { getSupplierSearchProviderStatus } from "@/modules/product-search/infrastructure/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const providerStatus = process.env.NODE_ENV === "development"
      ? await getSupplierSearchProviderStatus()
      : undefined;

    return NextResponse.json({
      service: "tradepilot-ai",
      status: "ok",
      database: "ok",
      ...(providerStatus ? { supplierSearchProvider: providerStatus } : {}),
    });
  } catch {
    return NextResponse.json(
      {
        service: "tradepilot-ai",
        status: "unavailable",
        database: "error",
      },
      { status: 503 },
    );
  }
}
