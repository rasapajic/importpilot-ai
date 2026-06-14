import { NextResponse } from "next/server";
import { getSupplierSearchProviderStatus } from "@/modules/product-search/infrastructure/provider";

export async function GET() {
  const providerStatus = await getSupplierSearchProviderStatus();
  return NextResponse.json({
    service: "tradepilot-ai",
    status: "ok",
    ...(process.env.NODE_ENV === "development"
      ? { supplierSearchProvider: providerStatus }
      : {}),
  });
}
