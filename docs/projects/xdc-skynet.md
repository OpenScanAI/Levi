# XDC SkyNet

## Project Overview

**XDC SkyNet** is a dashboard and API platform for XDC Network owners and operators. It provides real-time monitoring, fleet management, and operational intelligence for XDC nodes — described as "Datadog meets Blockchain Infrastructure," purpose-built for the XDC ecosystem.

SkyNet enables network owners to monitor anywhere from 1 to 1,000 nodes from a single screen, with capabilities including node diagnostics, peer intelligence, incident detection, and an automated issue pipeline that creates GitHub issues with suggested fixes.

## Problem It Solves

Operating XDC nodes at scale presents significant operational challenges:

- **Visibility Gap** — No centralized view of node health across a distributed fleet
- **Slow Incident Response** — Manual log checking and diagnostics delay root cause analysis
- **Peer Network Opacity** — Difficult to understand geographic distribution, latency, and client version diversity
- **Issue Tracking Overhead** — Problems detected on nodes require manual triage, deduplication, and ticketing
- **Lack of Automation** — No automated alerting or self-healing capabilities for common node issues

XDC SkyNet solves these by providing a unified command center where operators can monitor fleet health, detect anomalies automatically, and trigger remediation workflows — including auto-generated GitHub issues with analysis and fix scripts.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Fira Sans font |
| **Backend** | Node.js, Express, WebSocket |
| **Database** | PostgreSQL 14+, Redis |
| **Agent** | SkyOne Agent (node-side sidecar) |
| **Charts** | Pure SVG (no external charting libraries) |
| **Monitoring** | Prometheus, Grafana (optional) |
| **Deployment** | Docker, Docker Compose |

## Key Features

- 📊 **Fleet Management** — Monitor 1 to 1,000 nodes from one screen
- 🔍 **Node Diagnostics** — Root cause analysis in under 60 seconds
- 🌍 **Network Intelligence** — Geographic distribution, latency, health scoring
- 🚨 **Incident Detection** — Auto-detected anomalies with instant alerts
- 🤖 **Automated Issue Pipeline** — Deduplication, GitHub integration, auto-fixes
- 📡 **REST API** — Full-featured API for automation (heartbeat, metrics, commands)
- ⚡ **Real-Time Updates** — WebSocket support for live dashboards
- 🏆 **Validator Leaderboard** — Real-time ranking by stake and performance (Beta)
- 📱 **Mobile App** — iOS/Android companion app (Q3 2026)
- 🧠 **AI Diagnostics** — Intelligent root cause analysis (Q4 2026)

## Current Status

**Status:** Live

XDC SkyNet is operational at [xdc.openscan.ai](https://xdc.openscan.ai). The core dashboard, fleet management, node diagnostics, peer intelligence, and automated issue pipeline are all live. Key metrics tracked include:

- Fleet health score (0-100)
- Node status distribution (healthy, syncing, degraded, offline)
- Active incident counts by severity
- Average and max block height across fleet
- Storage metrics (chain data size, database size)
- Block increase rate and sync ETA

Upcoming milestones include the mobile app (Q3 2026) and AI-powered diagnostics (Q4 2026).
