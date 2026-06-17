import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "ioredis";
import { RateLimiter, createRateLimiter } from "../middleware/rate-limiter.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    path: "/api/companies",
    method: "GET",
    ip: "127.0.0.1",
    actor: { type: "none" as const, source: "none" as const },
    ...overrides,
  } as any;
}

describe("RateLimiter with Redis", () => {
  let redis: Redis;
  let limiter: RateLimiter;

  beforeEach(async () => {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
    await redis.flushall();
    limiter = createRateLimiter({ redis, failOpen: false });
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it("uses Redis for rate limiting when available", async () => {
    const req = createMockRequest();
    const result = await limiter.check(req);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
  });

  it("blocks requests after limit is exceeded", async () => {
    const req = createMockRequest();
    const limit = 60; // public tier limit

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      const result = await limiter.check(req);
      expect(result.allowed).toBe(true);
    }

    // Next request should be blocked
    const blocked = await limiter.check(req);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(limit + 1);
  });

  it("shares rate limit state across multiple limiter instances", async () => {
    const req = createMockRequest();
    const limit = 60;

    // Create two limiter instances sharing the same Redis
    const limiter1 = createRateLimiter({ redis, failOpen: false });
    const limiter2 = createRateLimiter({ redis, failOpen: false });

    // Exhaust limit using first limiter
    for (let i = 0; i < limit; i++) {
      await limiter1.check(req);
    }

    // Second limiter should see the same state and block
    const blocked = await limiter2.check(req);
    expect(blocked.allowed).toBe(false);
  });

  it("resets counter after window expires", async () => {
    const req = createMockRequest();
    const shortWindow = 100; // 100ms window for testing

    const shortLimiter = createRateLimiter({
      redis,
      failOpen: false,
      limits: { public: { windowMs: shortWindow, maxRequests: 2 } },
    });

    // Use up the limit
    await shortLimiter.check(req);
    await shortLimiter.check(req);
    const blocked = await shortLimiter.check(req);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, shortWindow + 50));

    // Should be allowed again
    const reset = await shortLimiter.check(req);
    expect(reset.allowed).toBe(true);
    expect(reset.count).toBe(1);
  });

  it("uses different keys for different IPs", async () => {
    const req1 = createMockRequest({ ip: "1.2.3.4" });
    const req2 = createMockRequest({ ip: "5.6.7.8" });
    const limit = 60;

    // Exhaust limit for first IP
    for (let i = 0; i < limit; i++) {
      await limiter.check(req1);
    }

    const blocked1 = await limiter.check(req1);
    expect(blocked1.allowed).toBe(false);

    // Second IP should still be allowed
    const allowed2 = await limiter.check(req2);
    expect(allowed2.allowed).toBe(true);
    expect(allowed2.count).toBe(1);
  });

  it("uses different keys for different tiers", async () => {
    const publicReq = createMockRequest({ actor: { type: "none", source: "none" } });
    const authReq = createMockRequest({
      actor: { type: "board", userId: "user-1", source: "session" },
      method: "GET",
    });

    const publicLimit = 60;
    const authLimit = 120;

    // Exhaust public limit
    for (let i = 0; i < publicLimit; i++) {
      await limiter.check(publicReq);
    }

    const blockedPublic = await limiter.check(publicReq);
    expect(blockedPublic.allowed).toBe(false);

    // Authenticated request should still be allowed (different tier)
    const allowedAuth = await limiter.check(authReq);
    expect(allowedAuth.allowed).toBe(true);
    expect(allowedAuth.count).toBe(1);
    expect(allowedAuth.limit).toBe(authLimit);
  });

  it("falls back to LRU when Redis is unavailable", async () => {
    // Simulate Redis failure by using a mock that throws on pipeline exec
    const mockRedis = {
      pipeline: () => ({
        zremrangebyscore: () => mockRedis.pipeline(),
        zcard: () => mockRedis.pipeline(),
        zadd: () => mockRedis.pipeline(),
        pexpire: () => mockRedis.pipeline(),
        exec: () => Promise.reject(new Error("Redis connection lost")),
      }),
      quit: () => Promise.resolve(),
    } as unknown as Redis;

    const fallbackLimiter = createRateLimiter({ redis: mockRedis, failOpen: true });
    const req = createMockRequest();

    // Should still work via LRU fallback
    const result = await fallbackLimiter.check(req);
    expect(result.allowed).toBe(true);

    await mockRedis.quit();
  });

  it("includes correct headers in middleware", async () => {
    const req = createMockRequest();
    const res = {
      setHeader: (name: string, value: string) => {
        (res as any).headers = (res as any).headers || {};
        (res as any).headers[name] = value;
      },
      status: () => res,
      json: () => res,
      headers: {} as Record<string, string>,
    } as any;

    const next = () => {};

    const middleware = limiter.middleware();
    await middleware(req, res, next);

    expect(res.headers["X-RateLimit-Limit"]).toBe("60");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("59");
    expect(res.headers["X-RateLimit-Tier"]).toBe("public");
    expect(res.headers["X-RateLimit-Reset"]).toBeDefined();
  });
});
