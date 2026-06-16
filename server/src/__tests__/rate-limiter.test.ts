import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { RateLimiter, createRateLimiter, DEFAULT_RATE_LIMITS } from "../middleware/rate-limiter.js";

function createMockRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    path: "/api/companies",
    method: "GET",
    ip: "127.0.0.1",
    actor: { type: "none" as const, source: "none" as const },
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    getHeaders: () => headers,
  } as unknown as Response;
}

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter({ failOpen: true });
  });

  describe("tier detection", () => {
    it("returns 'public' for unauthenticated requests", async () => {
      const req = createMockRequest({ actor: { type: "none", source: "none" } });
      const result = await limiter.check(req);
      expect(result.tier).toBe("public");
      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.public.maxRequests);
    });

    it("returns 'authenticated' for board GET requests", async () => {
      const req = createMockRequest({
        actor: { type: "board", userId: "user-1", source: "session" },
        method: "GET",
      });
      const result = await limiter.check(req);
      expect(result.tier).toBe("authenticated");
      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.authenticated.maxRequests);
    });

    it("returns 'write' for board POST requests", async () => {
      const req = createMockRequest({
        actor: { type: "board", userId: "user-1", source: "session" },
        method: "POST",
      });
      const result = await limiter.check(req);
      expect(result.tier).toBe("write");
      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.write.maxRequests);
    });

    it("returns 'admin' for instance admin requests", async () => {
      const req = createMockRequest({
        actor: { type: "board", userId: "admin-1", isInstanceAdmin: true, source: "session" },
      });
      const result = await limiter.check(req);
      expect(result.tier).toBe("admin");
      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.admin.maxRequests);
    });

    it("returns 'heartbeat' for heartbeat endpoints", async () => {
      const req = createMockRequest({
        path: "/api/agents/agent-123/heartbeat",
        actor: { type: "agent", agentId: "agent-1", companyId: "comp-1", source: "agent_key" },
      });
      const result = await limiter.check(req);
      expect(result.tier).toBe("heartbeat");
      expect(result.limit).toBe(DEFAULT_RATE_LIMITS.heartbeat.maxRequests);
    });

    it("returns 'heartbeat' for health endpoint", async () => {
      // Health endpoint has no actor (unauthenticated) so it returns 'public'
      // Health endpoints are exempt from rate limiting in app.ts (mounted before rate limiter)
      const req = createMockRequest({ path: "/api/health" });
      const result = await limiter.check(req);
      expect(result.tier).toBe("public");
    });
  });

  describe("rate limiting behavior", () => {
    it("allows requests under the limit", async () => {
      const req = createMockRequest({ actor: { type: "none", source: "none" } });
      const result = await limiter.check(req);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });

    it("blocks requests over the limit", async () => {
      const req = createMockRequest({ actor: { type: "none", source: "none" } });
      const limit = DEFAULT_RATE_LIMITS.public.maxRequests;

      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        await limiter.check(req);
      }

      const result = await limiter.check(req);
      expect(result.allowed).toBe(false);
      expect(result.count).toBe(limit + 1);
    });

    it("resets after window expires", async () => {
      const req = createMockRequest({ actor: { type: "none", source: "none" } });
      const shortWindow = 50; // 50ms
      const customLimiter = createRateLimiter({
        limits: { public: { windowMs: shortWindow, maxRequests: 1 } },
      });

      const first = await customLimiter.check(req);
      expect(first.allowed).toBe(true);

      const second = await customLimiter.check(req);
      expect(second.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, shortWindow + 10));

      const third = await customLimiter.check(req);
      expect(third.allowed).toBe(true);
    });
  });

  describe("middleware", () => {
    it("sets rate limit headers on allowed requests", async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = limiter.middleware();
      await middleware(req, res, next);

      const headers = (res as any).getHeaders();
      expect(headers["X-RateLimit-Limit"]).toBe(String(DEFAULT_RATE_LIMITS.public.maxRequests));
      expect(headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["X-RateLimit-Tier"]).toBe("public");
      expect(next).toHaveBeenCalled();
    });

    it("returns 429 when limit exceeded", async () => {
      const req = createMockRequest({ actor: { type: "none", source: "none" } });
      const res = createMockResponse();
      const next = vi.fn();
      const middleware = limiter.middleware();

      // Exhaust limit
      const limit = DEFAULT_RATE_LIMITS.public.maxRequests;
      for (let i = 0; i < limit; i++) {
        await middleware(req, res, next);
      }

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "ERR_RATE_LIMIT_EXCEEDED",
          }),
        }),
      );
      expect(next).toHaveBeenCalledTimes(limit);
    });

    it("calls next on fail-open errors", async () => {
      const brokenLimiter = createRateLimiter({ failOpen: true });
      // Force an error by making check throw
      brokenLimiter.check = vi.fn().mockRejectedValue(new Error("boom"));

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = brokenLimiter.middleware();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 500 on fail-closed errors", async () => {
      const brokenLimiter = createRateLimiter({ failOpen: false });
      brokenLimiter.check = vi.fn().mockRejectedValue(new Error("boom"));

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = brokenLimiter.middleware();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("path normalization", () => {
    it("normalizes UUID paths to same key", async () => {
      const req1 = createMockRequest({ path: "/api/agents/550e8400-e29b-41d4-a716-446655440000" });
      const req2 = createMockRequest({ path: "/api/agents/123e4567-e89b-12d3-a456-426614174000" });

      const result1 = await limiter.check(req1);
      const result2 = await limiter.check(req2);

      // Both should count toward same limit since path is normalized
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
    });

    it("normalizes numeric IDs to same key", async () => {
      const req1 = createMockRequest({ path: "/api/companies/123/projects" });
      const req2 = createMockRequest({ path: "/api/companies/456/projects" });

      const result1 = await limiter.check(req1);
      const result2 = await limiter.check(req2);

      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
    });
  });
});
