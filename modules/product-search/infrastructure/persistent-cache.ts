import type { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/database/prisma";
import {
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type SupplierOfferSearchInput,
  type SupplierOfferSearchResult,
} from "../domain/search";

export const SUPPLIER_SEARCH_PERSISTENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function normalizeSupplierSearchQuery(query: string) {
  return query
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function supplierSearchCacheSource(results: SupplierOfferSearchResult[]) {
  return [...new Set(results.map((result) => result.source))].sort().join(", ").slice(0, 200);
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function storeSuccessfulSupplierSearch(
  rawInput: SupplierOfferSearchInput,
  rawResults: SupplierOfferSearchResult[],
  now = new Date(),
) {
  const input = supplierOfferSearchInputSchema.parse(rawInput);
  const results = supplierOfferSearchResultsSchema.min(1).parse(rawResults);
  const normalizedQuery = normalizeSupplierSearchQuery(input.query);
  const data = {
    query: input.query,
    normalizedQuery,
    targetCountry: input.targetCountry,
    quantity: input.quantity,
    source: supplierSearchCacheSource(results),
    resultsJson: jsonValue(results),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SUPPLIER_SEARCH_PERSISTENT_CACHE_TTL_MS),
  };

  return prisma.supplierSearchCache.upsert({
    where: {
      normalizedQuery_targetCountry_quantity: {
        normalizedQuery,
        targetCountry: input.targetCountry,
        quantity: input.quantity,
      },
    },
    create: data,
    update: data,
  });
}

export async function findLastSuccessfulSupplierSearch(rawInput: SupplierOfferSearchInput) {
  const input = supplierOfferSearchInputSchema.parse(rawInput);
  const entry = await prisma.supplierSearchCache.findUnique({
    where: {
      normalizedQuery_targetCountry_quantity: {
        normalizedQuery: normalizeSupplierSearchQuery(input.query),
        targetCountry: input.targetCountry,
        quantity: input.quantity,
      },
    },
  });
  if (!entry) return null;

  const parsed = supplierOfferSearchResultsSchema.safeParse(entry.resultsJson);
  if (!parsed.success || parsed.data.length === 0) return null;
  return {
    results: parsed.data,
    source: entry.source,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  };
}
