# GoCloudX

## Project Overview

**GoCloudX (GCX)** is a comprehensive cloud infrastructure platform that combines traditional VM provisioning with Web3 capabilities. It enables users to deploy virtual machines in seconds, pay with cryptocurrency or fiat, and manage everything through an intuitive dashboard.

GCX bridges the gap between conventional cloud computing and blockchain-native infrastructure, offering features like multi-chain wallet support, smart contract interaction, NFT management, and KYC verification alongside standard cloud services such as VM provisioning, network management, and usage tracking.

## Problem It Solves

Existing cloud platforms force users to choose between traditional Web2 infrastructure and emerging Web3 capabilities. GoCloudX solves this fragmentation by unifying both worlds:

- **Unified Billing** — Pay with credit card (Stripe, PayPal, Razorpay) **or** cryptocurrency (multi-chain wallet support)
- **VM + Web3** — Deploy traditional VMs while interacting with smart contracts and managing digital assets
- **Identity Verification** — Built-in KYC flow (SumSub integration) for compliance without third-party tools
- **Team Management** — Role-based access control for organizations managing cloud and blockchain resources
- **Real-Time Analytics** — ClickHouse-powered usage tracking and billing with real-time resource monitoring
- **Subscription Flexibility** — Daily, monthly, and quarterly billing cycles with upgrade/downgrade support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, RainbowKit |
| **Backend** | Fastify, Node.js 20, Prisma ORM, BullMQ |
| **Database** | PostgreSQL 15, Redis 7, ClickHouse (analytics) |
| **Blockchain** | Ethers.js v6, Viem, Web3 providers (XDC, Ethereum, BSC, Polygon, Solana) |
| **Infrastructure** | Docker, Docker Compose, Nginx, CloudStack (VM provisioning) |
| **Payments** | Stripe, PayPal, Razorpay, cryptocurrency via RainbowKit |
| **Queue System** | BullMQ with Redis |
| **KYC** | SumSub integration |

## Key Features

- ⚡ **Instant VM Provisioning** — Deploy VMs in seconds via CloudStack integration
- 🌐 **Network Management** — VPCs, firewall rules, load balancers, elastic IPs, VPN gateways, network ACLs
- 💳 **Flexible Payments** — Credit card, PayPal, Razorpay, or cryptocurrency
- 📊 **Usage Tracking** — Real-time resource monitoring and ClickHouse analytics
- 🔐 **Role-Based Access Control** — Granular permissions for teams and organizations
- 🔄 **Subscription Plans** — Daily, monthly, quarterly billing with upgrade/downgrade
- 🎁 **Bonus Credits** — Configurable signup and deployment bonus credits
- 💰 **Credit Ledger** — Complete credit transaction history and balance management
- 🔁 **Auto-Recharge** — Automatic credit top-up when balance runs low
- 🔗 **Multi-Chain Wallets** — XDC, Ethereum, BSC, Polygon, Solana via RainbowKit
- 🪙 **Token Management** — Track balances across multiple chains and tokens
- 📝 **Smart Contract Interaction** — Read contract data, decode transactions, estimate gas
- 🎨 **NFT Support** — View and manage NFT collections
- 🔍 **Transaction Analysis** — Mempool monitoring, internal transaction tracking
- ⚠️ **Risk Scoring** — Address risk assessment and labeling
- 🛡️ **KYC Verification** — Document upload and review via SumSub
- 🔑 **Two-Factor Authentication** — TOTP-based 2FA
- 📜 **Audit Logging** — Complete activity tracking for compliance
- 🔌 **REST API** — 90+ endpoints for all platform features
- 🔔 **Webhooks** — Real-time event notifications

## Current Status

**Status:** In Active Development

GoCloudX is under active development with a comprehensive feature set spanning cloud infrastructure and Web3 integration. The platform architecture supports:

- 4 main services: Web (port 3000), API (port 3001), WebSocket (port 3002), Provisioner (port 3003)
- 15+ background microservices (analytics, backup, billing, bridge-monitor, compliance, DDoS, KYC, monitoring, network, provisioning, RBAC, secrets, security, SSL, VM, WAF, webhooks)
- Full test coverage with Vitest (API, Web, WebSocket, Provisioner) and Playwright (E2E)
- CI/CD pipeline via GitHub Actions

The project is structured as a pnpm monorepo with Turbo orchestration and is designed for production deployment via Docker Compose or Kubernetes.
