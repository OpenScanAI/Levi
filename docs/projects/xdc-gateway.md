# XDC Gateway

## Project Overview

**XDC Gateway** is an enterprise-grade multi-chain RPC infrastructure platform — like Infura, Alchemy, or Ankr — purpose-built for the XDC Network and EVM-compatible chains. It provides developers with reliable, high-performance API access to blockchain nodes through a unified gateway with intelligent routing, caching, and analytics.

The platform serves as the backbone for developers building on XDC, offering everything from free-tier API keys for hobbyists to enterprise-grade workspaces with custom domains, team management, and detailed usage analytics.

## Problem It Solves

Running blockchain infrastructure at scale is complex and expensive. Developers and enterprises face challenges such as:

- **Node Reliability** — Self-managed nodes suffer from downtime, sync issues, and maintenance overhead
- **Rate Limiting & Abuse** — Without proper gating, APIs can be overwhelmed by malicious or accidental high-volume traffic
- **Multi-Chain Complexity** — Managing connections to multiple networks (XDC Mainnet, Apothem Testnet, EVM chains) requires significant infrastructure investment
- **Lack of Visibility** — No insight into API usage patterns, method breakdowns, or cost attribution
- **Enterprise Requirements** — Teams need workspaces, RBAC, audit logs, and custom domain support

XDC Gateway solves these by providing a managed, scalable RPC layer with built-in authentication, rate limiting, credit-based billing, and comprehensive analytics.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | Fastify, Node.js 20, Prisma ORM, Zod validation |
| **Database** | PostgreSQL 15, Redis 7, ClickHouse (analytics) |
| **RPC Layer** | Custom RPC Proxy → eRPC → upstream XDC/EVM nodes |
| **Auth** | ES256 JWT with refresh token rotation, scope-based RBAC |
| **Queue System** | BullMQ with Redis |
| **Monitoring** | Prometheus, Grafana |
| **Deployment** | Docker, Docker Compose, PM2 |

## Key Features

- 🚀 **RPC-Proxy** — Intelligent API gateway with auth, rate limiting, and credit management
- 🔄 **eRPC Integration** — High-availability RPC aggregation with automatic failover
- ⛓️ **Multi-Chain Support** — XDC Mainnet, XDC Apothem Testnet + EVM chains
- 💾 **Smart Caching** — Redis-backed caching with TTL policies
- 🔌 **WebSocket Support** — Real-time subscriptions for supported networks
- 📊 **Usage Analytics** — Real-time stats, method breakdown, cost analysis via ClickHouse
- 🏢 **Workspace & Teams** — Multi-tenant workspaces with role-based access control
- 🎨 **White-Label Partners** — Subdomain + custom domain routing for partner organizations
- 🔐 **Security** — JWT auth, 2FA, IP allowlisting, origin restrictions, audit logging
- 👑 **Super Admin Panel** — System monitoring, PM2 management, network controls

## Current Status

**Status:** Production Ready (88% Complete)

XDC Gateway is live and serving production traffic at [cloud.xdcrpc.com](https://cloud.xdcrpc.com). Current metrics:

| Metric | Value |
|--------|-------|
| Total Features | 107+ |
| Production Ready | 94 (88%) ✅ |
| In Progress | 10 (9%) 🚧 |
| Planned | 4 (4%) ⏳ |
| E2E Pass Rate | 88.1% (104/118 tests) |

Active development areas include partner white-label custom domain SSL auto-provisioning, ES256 JWT migration completion, and analytics dashboard enhancements.
