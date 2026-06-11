# Sukuna

## Project Overview

**Sukuna** is a CLI-based vulnerability scanner with explicit safety guarantees, designed for authorized security testing and structured audit reporting. Named after the concept of precision and control, Sukuna provides a modular, extensible framework for offensive security operations while maintaining strict ethical boundaries and legal compliance.

The tool simulates real-world attacks on web applications to identify vulnerabilities, analyze logs, and generate structured audit reports. It is built for security researchers, penetration testers, and red teams who need a fast, scriptable interface with a layered safety model.

## Problem It Solves

Security testing tools often lack sufficient safety controls, leading to accidental scans of unauthorized targets, excessive traffic, or unclear authorization trails. Sukuna solves this through:

- **Explicit Authorization Requirements** — The `--i-have-authorization` flag forces operators to acknowledge permission before scanning public targets
- **Target Validation** — Refuses `file://`, RFC1918, loopback, and link-local addresses by default (opt-in via `--allow-local`)
- **Rate Limiting** — Token-bucket per-process requests-per-second cap (default: 10 RPS) to prevent accidental DoS
- **Scope Enforcement** — Hostname allowlist ensures scans stay within authorized boundaries
- **Audit Trail** — JSON reports include `metadata.authorization` and `metadata.auditTrailNotices` for compliance
- **Honest Roadmap** — Clear documentation of what ships today vs. what is planned, avoiding hype

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Language** | TypeScript 5.0+ |
| **CLI Framework** | Commander.js |
| **HTTP Client** | Axios (with custom interceptors) |
| **Logging** | Pino |
| **Testing** | Vitest (162 tests across 16 files) |
| **Report Generation** | JSON (HTML/PDF/SARIF planned) |

## Key Features

- 🔍 **5 Attack Modules** — Tech detection, SQLi, XSS, auth bypass, SSRF
- 🛡️ **Layered Safety Model** — Target validation, authorization ack, rate limiting, scope guard
- 📊 **JSON Reporter** — Structured output with metadata, findings, and audit trail
- ⚡ **Fast & Scriptable** — CLI-first design for CI/CD integration
- 🧪 **Well-Tested** — Pure-function safety modules with dedicated test suites
- 🔒 **No Telemetry** — Zero outbound connections to authors; fully private operation
- 📋 **Exit Code Gating** — Configurable `--fail-on` severity for CI pipelines

## Current Status

**Status:** v0.3 In Progress

Sukuna v0.3 is actively developed with 5 attack modules and a comprehensive safety model shipped. The JSON reporter is the only implemented output format (HTML, PDF, and SARIF are deferred to v0.4+). Key roadmap items include:

- **v0.4 (Q4 2026)** — Detection-quality improvements, context-aware XSS, anchored-regex SQLi, byte-diff auth-bypass
- **v0.5 (Q1 2027)** — SQLite-backed persistence, cross-scan learning
- **v0.6** — OAST / out-of-band blind detection (interactsh integration)
- **v1.0** — Plugin SDK + Nuclei template support
- **v2.0** — Purple Team platform with detection validation and WAF classification

The project is pre-v1.0 with a clear, honest roadmap documented in the codebase.
