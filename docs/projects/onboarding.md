# Onboarding

## Project Overview

The **Onboarding** project is a developer-first experience designed to take new users from signup to their first successful RPC call in under 2 minutes. It serves as the entry point for developers integrating with the XDC Gateway platform, providing a frictionless journey through account creation, API key generation, and interactive code examples.

Built with a focus on zero-friction onboarding, the project includes an embedded interactive playground that pre-fills the user's actual API key into code snippets across multiple languages (cURL, JavaScript, Python), eliminating copy-paste errors and accelerating time-to-first-call.

## Problem It Solves

Traditional blockchain infrastructure platforms often have steep onboarding curves requiring extensive documentation reading, manual configuration, and trial-and-error before making the first API call. The Onboarding project solves this by:

- **Reducing time-to-first-call** from hours to under 2 minutes
- **Eliminating configuration friction** through pre-filled, personalized code examples
- **Guiding users through milestones** with an interactive checklist and progress tracking
- **Celebrating success** with visual feedback (confetti, badges) to reinforce engagement
- **Providing contextual help** via tooltips and an email drip sequence for continued learning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | Fastify, Node.js 20, Prisma ORM |
| **Database** | PostgreSQL 15, Redis 7 |
| **Auth** | JWT with refresh tokens, OAuth (Google/GitHub) |
| **Email** | Magic link verification, drip sequence automation |

## Key Features

- ⚡ **Sub-2-Minute Onboarding** — From signup to first RPC call
- 🔑 **One-Click API Key Creation** — Auto-labeled keys with secure copy-to-clipboard
- 📝 **Multi-Language Playground** — Pre-filled cURL, JavaScript, and Python snippets
- ✅ **Interactive Checklist** — Milestone tracking with visual progress
- 🎉 **Success Celebration** — Confetti and badges on first successful call
- 📧 **Email Drip Sequence** — Automated follow-ups at Day 0, 1, 3, 7, and 14
- 🏷️ **Badge System** — "Builder", "Connected", "Power User" achievement tiers

## Current Status

**Status:** Implemented and Live

The onboarding flow is fully implemented and active on the XDC Gateway platform. All 5 steps (Sign Up → Email Verify → Dashboard → Create API Key → First Call → Success) are operational. The email drip sequence and badge system are integrated. Future enhancements may include additional language support in the playground and AI-assisted troubleshooting for failed first calls.
