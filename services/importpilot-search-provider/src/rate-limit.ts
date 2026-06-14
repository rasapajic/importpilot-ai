type Bucket = { count: number; resetAt: number };

export function createRateLimiter(maxRequests: number, windowMs: number, now = Date.now) {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string) {
      const currentTime = now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= currentTime) {
        buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (bucket.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1_000)),
        };
      }
      bucket.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
