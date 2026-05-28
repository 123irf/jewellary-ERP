import type { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet } from '../lib/cache.js';

/**
 * Express middleware that caches JSON responses for GET requests.
 *
 * @param prefix  Domain prefix for the cache key (e.g. "products", "vendors")
 * @param ttl     Cache TTL in milliseconds (default: 30000)
 *
 * Cache key = `${prefix}:${fullUrl}` so different query params get separate entries.
 * Only caches responses with status 200.
 */
export function cacheResponse(prefix: string, ttl?: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const cacheKey = `${prefix}:${req.originalUrl}`;
    const cached = cacheGet<{ status: number; body: unknown }>(cacheKey);

    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }

    // Intercept res.json to capture the response for caching
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        cacheSet(cacheKey, { status: 200, body }, ttl);
      }
      return originalJson(body);
    };

    next();
  };
}
