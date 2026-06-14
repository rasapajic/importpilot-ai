import { createHash } from "node:crypto";

import { prisma } from "@/lib/database/prisma";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitRow = {
  count: number;
  window_ends_at: Date;
};

export async function consumeRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions) {
  const keyHash = createHash("sha256").update(key).digest("hex");
  const windowEndsAt = new Date(Date.now() + windowSeconds * 1000);

  const [bucket] = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "rate_limit_buckets" ("key_hash", "count", "window_ends_at", "created_at", "updated_at")
    VALUES (${keyHash}, 1, ${windowEndsAt}, NOW(), NOW())
    ON CONFLICT ("key_hash") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limit_buckets"."window_ends_at" <= NOW() THEN 1
        ELSE "rate_limit_buckets"."count" + 1
      END,
      "window_ends_at" = CASE
        WHEN "rate_limit_buckets"."window_ends_at" <= NOW() THEN ${windowEndsAt}
        ELSE "rate_limit_buckets"."window_ends_at"
      END,
      "updated_at" = NOW()
    RETURNING "count", "window_ends_at"
  `;

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((bucket.window_ends_at.getTime() - Date.now()) / 1000),
    ),
  };
}

