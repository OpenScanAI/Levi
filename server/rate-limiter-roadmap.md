# Smart Rate Limiter — Development Roadmap

## Phase 1: Core
- Token bucket algorithm
- Sliding window
- Fixed window

## Phase 2: Storage
- Redis adapter
- In-memory adapter

## Phase 3: Integration
- Express middleware
- Fastify plugin

---

> **Convention Note:** All rate limiter implementations must expose a unified interface:
> ```ts
> checkLimit(key: string, limit: number, windowMs: number): Promise<{
>   allowed: boolean,
>   remaining: number,
>   resetAt: Date
> }>
> ```
