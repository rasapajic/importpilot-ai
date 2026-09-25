import { Prisma } from "@prisma/client";

export function serializePrismaDecimals<T>(value: T): T {
  if (Prisma.Decimal.isDecimal(value)) {
    return value.toString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializePrismaDecimals(item)) as T;
  }

  if (value instanceof Date || value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializePrismaDecimals(item)]),
  ) as T;
}
