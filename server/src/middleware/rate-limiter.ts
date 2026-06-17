import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { Redis } from "ioredis";

export type RateLimitTier = "public" | "authenticated" | "heartbeat" | "write" | "admin";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitTier, RateLimitConfig> = {
  public: { windowMs: 60_000, maxRequests: 60 },
  authenticated: { windowMs: 60_000, maxRequests: 120 },
  heartbeat: { windowMs: 60_000, maxRequests: 120 },
  write: { windowMs: 60_000, maxRequests: 30 },
  admin: { windowMs: 60_000, maxRequests: 300 },
};

interface LruEntry {
  count: number;
  resetTime: number;
}

class LruFallbackStore {
  private store = new Map<string, LruEntry>();
  private maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  private evictIfNeeded() {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.resetTime > now) {
      existing.count += 1;
      return { count: existing.count, resetTime: existing.resetTime };
    }

    this.evictIfNeeded();
    const resetTime = now + windowMs;
    const entry: LruEntry = { count: 1, resetTime };
    this.store.set(key, entry);
    return { count: 1, resetTime };
  }

  async get(key: string): Promise<{ count: number; resetTime: number } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.resetTime <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return { count: entry.count, resetTime: entry.resetTime };
  }
}

export interface RateLimiterOptions {
  redis?: Redis;
  limits?: Partial<Record<RateLimitTier, RateLimitConfig>>;
  keyPrefix?: string;
  failOpen?: boolean;
  lruMaxSize?: number;
}

export class RateLimiter {
  private redis?: Redis;
  private lru: LruFallbackStore;
  private limits: Record<RateLimitTier, RateLimitConfig>;
  private keyPrefix: string;
  private failOpen: boolean;

  constructor(opts: RateLimiterOptions = {}) {
    this.redis = opts.redis;
    this.lru = new LruFallbackStore(opts.lruMaxSize ?? 10_000);
    this.limits = { ...DEFAULT_RATE_LIMITS, ...opts.limits };
    this.keyPrefix = opts.keyPrefix ?? "rl:";
    this.failOpen = opts.failOpen ?? true;
  }

  private resolveTier(req: Request): RateLimitTier {
    const actor = req.actor;
    if (!actor || actor.type === "none") return "public";

    if (actor.isInstanceAdmin) return "admin";

    const path = req.path.toLowerCase();
    const method = req.method.toUpperCase();

    // Heartbeat endpoints: agent heartbeat invoke, heartbeat runs, scheduler heartbeats
    if (
      (path.includes("/agents/") && path.includes("/heartbeat")) ||
      path.includes("/heartbeat-runs") ||
      path.includes("/scheduler-heartbeats") ||
      path.includes("/health")
    ) {
      return "heartbeat";
    }

    // Write operations: POST, PUT, DELETE, PATCH
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) return "write";

    return "authenticated";
  }

  private buildKey(req: Request, tier: RateLimitTier): string {
    const actor = req.actor;
    // Use a broader identifier for rate limiting to prevent per-endpoint gaming
    // Group by route pattern rather than exact path for parameterized routes
    const identifier = actor?.type === "agent"
      ? actor.agentId ?? req.ip ?? "unknown"
      : actor?.type === "board"
        ? actor.userId ?? req.ip ?? "unknown"
        : req.ip ?? "unknown";

    // Normalize path: remove IDs to group similar routes under same limit
    // e.g., /agents/123/heartbeat -> /agents/:id/heartbeat
    const normalizedPath = req.path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id") // UUIDs
      .replace(/\/[0-9a-f]{24,}/gi, "/:id") // MongoDB-style IDs
      .replace(/\/\d+/g, "/:id"); // Numeric IDs

    const pathHash = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 16);
    return `${this.keyPrefix}${tier}:${identifier}:${pathHash}`;
  }

  private async checkRedis(key: string, limit: RateLimitConfig): Promise<{ allowed: boolean; count: number; resetTime: number } | null> {
    if (!this.redis) return null;

    try {
      const now = Date.now();
      const windowStart = now - limit.windowMs;

      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.pexpire(key, limit.windowMs);

      const results = await pipeline.exec();
      if (!results) return null;

      const count = (results[1]?.[1] as number) ?? 0;
      const resetTime = now + limit.windowMs;
      const allowed = count < limit.maxRequests;

      return { allowed, count: count + 1, resetTime };
    } catch (err) {
      return null;
    }
  }

  private async checkLru(key: string, limit: RateLimitConfig): Promise<{ allowed: boolean; count: number; resetTime: number }> {
    const result = await this.lru.increment(key, limit.windowMs);
    const allowed = result.count <= limit.maxRequests;
    return { allowed, count: result.count, resetTime: result.resetTime };
  }

  async check(req: Request): Promise<{ allowed: boolean; count: number; limit: number; resetTime: number; tier: RateLimitTier }> {
    const tier = this.resolveTier(req);
    const limit = this.limits[tier];
    const key = this.buildKey(req, tier);

    let result = await this.checkRedis(key, limit);
    if (result === null) {
      result = await this.checkLru(key, limit);
    }

    return {
      allowed: result.allowed,
      count: result.count,
      limit: limit.maxRequests,
      resetTime: result.resetTime,
      tier,
    };
  }

  middleware(): RequestHandler {
    return async (req, res, next) => {
      try {
        const result = await this.check(req);

        res.setHeader("X-RateLimit-Limit", String(result.limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.limit - result.count)));
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetTime / 1000)));
        res.setHeader("X-RateLimit-Tier", result.tier);

        if (!result.allowed) {
          res.status(429).json({
            success: false,
            error: {
              code: "ERR_RATE_LIMIT_EXCEEDED",
              message: `Rate limit exceeded for tier ${result.tier}. Limit: ${result.limit} requests per ${this.limits[result.tier].windowMs / 1000}s.`,
            },
          });
          return;
        }

        next();
      } catch (err) {
        if (this.failOpen) {
          next();
        } else {
          res.status(500).json({
            success: false,
            error: {
              code: "ERR_RATE_LIMITER_FAILURE",
              message: "Rate limiter encountered an error.",
            },
          });
        }
      }
    };
  }
}

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  return new RateLimiter(opts);
}
