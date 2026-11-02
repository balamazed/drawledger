import { HttpError } from "./http";

const buckets = new Map<string, { count: number; reset: number }>();

// Fixed-window limiter per key; good enough for a single instance, swap for Redis when scaling out
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++b.count > limit) throw new HttpError(429, "Too many requests, try again shortly");
}
