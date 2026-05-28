import { LRUCache } from 'lru-cache';

// ─── Central LRU Cache ──────────────────────────────────────────
// Single shared cache instance for the API.
// Keys are prefixed by domain (e.g. "products:", "vendors:") so
// invalidation can target an entire domain with a prefix scan.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new LRUCache<string, any>({
  max: 500,            // max 500 entries
  ttl: 30_000,         // default 30s TTL
  allowStale: false,
});

// ─── Helpers ─────────────────────────────────────────────────────

/** Get a cached value by exact key. */
export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

/** Set a cached value with optional custom TTL (ms). */
export function cacheSet<T>(key: string, value: T, ttl?: number): void {
  cache.set(key, value, ttl ? { ttl } : undefined);
}

/**
 * Invalidate all keys starting with `prefix`.
 * e.g. invalidatePrefix('products') clears "products:list?page=1", "products:detail:abc", etc.
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/** Invalidate a single exact key. */
export function invalidateKey(key: string): void {
  cache.delete(key);
}

/** Clear entire cache (for testing / manual reset). */
export function clearCache(): void {
  cache.clear();
}

export { cache };
