import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  previewProjectSupplierOfferUrl,
  ProductSearchProjectNotFoundError,
} from "@/modules/product-search/application/product-search-service";
import { supplierOfferUrlImportRequestSchema } from "@/modules/product-search/domain/search";
import {
  buildSlugFallbackPreview,
  getUrlImportRuntimeDiagnostics,
  UrlImportBlockedError,
  UrlImportFetchError,
  UrlImportMissingProductIdentifierError,
  UrlImportParsingError,
  UrlImportResponseTooLargeError,
  UrlImportTimeoutError,
  UrlImportUnsupportedUrlError,
} from "@/modules/product-search/infrastructure/url-import-provider";

function previewFieldCount(preview: { title?: unknown; supplierName?: unknown; price?: unknown; currency?: unknown; minimumOrderQuantity?: unknown; imageUrl?: unknown }) {
  return [
    preview.title,
    preview.supplierName,
    preview.price,
    preview.currency,
    preview.minimumOrderQuantity,
    preview.imageUrl,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function logPreviewRoute(event: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[url-import-route]", JSON.stringify(event));
}

function developmentDiagnostics(extra: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return undefined;
  return { ...getUrlImportRuntimeDiagnostics(), ...extra };
}

function fallbackBody(productUrl: string, error: string) {
  return {
    error,
    fallbackPreview: buildSlugFallbackPreview(productUrl) ?? undefined,
    diagnostics: developmentDiagnostics({ providerStatus: "fallback" }),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const parsed = supplierOfferUrlImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unesite ispravan HTTPS link." }, { status: 400 });
  }

  try {
    const preview = await previewProjectSupplierOfferUrl(
      (await params).projectId,
      auth.membership.organizationId,
      parsed.data.productUrl,
    );
    logPreviewRoute({
      route: "/api/projects/[projectId]/supplier-search/url-preview",
      externalProviderConfigured: Boolean(process.env.URL_IMPORT_PROVIDER_URL),
      providerUrl: process.env.URL_IMPORT_PROVIDER_URL ?? null,
      providerResponseStatus: 200,
      previewPresent: true,
      errorPresent: false,
      previewFieldCount: previewFieldCount(preview),
      title: preview.title,
      supplier: preview.supplierName,
      price: preview.price,
      MOQ: preview.minimumOrderQuantity,
      image: preview.imageUrl,
    });
    return NextResponse.json({
      preview,
      diagnostics: developmentDiagnostics({
        providerStatus: "success",
        previewFieldCount: previewFieldCount(preview),
        title: preview.title,
        supplier: preview.supplierName,
        price: preview.price,
        MOQ: preview.minimumOrderQuantity,
        image: preview.imageUrl,
      }),
    });
  } catch (error) {
    logPreviewRoute({
      route: "/api/projects/[projectId]/supplier-search/url-preview",
      externalProviderConfigured: Boolean(process.env.URL_IMPORT_PROVIDER_URL),
      providerUrl: process.env.URL_IMPORT_PROVIDER_URL ?? null,
      providerResponseStatus: "error",
      previewPresent: false,
      errorPresent: true,
      errorName: error instanceof Error ? error.constructor.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ProductSearchProjectNotFoundError) {
      return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof UrlImportUnsupportedUrlError) {
      return NextResponse.json({ error: "Link nije prepoznat kao Alibaba ili Made-in-China proizvod." }, { status: 422 });
    }
    if (error instanceof UrlImportMissingProductIdentifierError) {
      return NextResponse.json({ error: "Link ne sadrži prepoznatljiv identifikator proizvoda." }, { status: 422 });
    }
    if (error instanceof UrlImportBlockedError) {
      return NextResponse.json(fallbackBody(parsed.data.productUrl, "Alibaba trenutno blokira automatsko preuzimanje ovog proizvoda."), { status: 423 });
    }
    if (error instanceof UrlImportParsingError) {
      return NextResponse.json({ error: "Nismo uspeli da pronađemo podatke o proizvodu na ovoj stranici." }, { status: 422 });
    }
    if (error instanceof UrlImportTimeoutError) {
      return NextResponse.json(fallbackBody(parsed.data.productUrl, "Link nije odgovorio na vreme. Pokušajte ponovo."), { status: 504 });
    }
    if (error instanceof UrlImportResponseTooLargeError) {
      return NextResponse.json({ error: "Stranica je prevelika za bezbedan uvoz." }, { status: 413 });
    }
    if (error instanceof UrlImportFetchError) {
      return NextResponse.json(fallbackBody(parsed.data.productUrl, "Došlo je do mrežne greške. Pokušajte ponovo."), { status: 422 });
    }
    throw error;
  }
}
