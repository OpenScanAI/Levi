# Agent Activity Dashboard

## Overview

The Agent Activity Dashboard provides real-time visibility into agent operations, security findings, report generation, and notification management across all companies in the Paperclip platform.

## Features

### Live Telemetry (Overview Tab)
- Active agent count
- Findings discovered today
- Success rate percentage
- Stuck agents count
- Auto-refreshes via WebSocket live events

### Run History
- Sortable/filterable table of all agent runs
- Status badges (succeeded, failed, stuck, running)
- Duration and timestamp display
- Pagination support

### Findings
- Severity-filtered findings list (critical, high, medium, low, info)
- Category badges
- Verification toggle
- Detail sheet for full finding information

### Reports
- Report type filter (EOD, import summary, custom)
- PDF generation and download
- Create/delete reports with confirmation
- Content preview

### Notifications
- Full CRUD for notification configurations
- Event type multi-select (run failed, run completed, finding created, etc.)
- Test button for verifying delivery
- Enable/disable toggle
- Supports Telegram and generic webhooks

### Bulk Operations
- Import agents from multiple GitHub repos
- Bulk enable/disable/terminate agents
- Cross-repo agent comparison

## API Endpoints

### Findings
- `GET /companies/:companyId/findings` - List with filters
- `GET /companies/:companyId/findings/summary` - Severity summary
- `POST /companies/:companyId/findings` - Create finding
- `GET /companies/:companyId/findings/:id` - Get single finding
- `PATCH /companies/:companyId/findings/:id` - Update finding
- `POST /companies/:companyId/findings/:id/verify` - Verify finding
- `DELETE /companies/:companyId/findings/:id` - Delete finding

### Reports
- `GET /companies/:companyId/reports` - List reports
- `POST /companies/:companyId/reports` - Create report
- `GET /companies/:companyId/reports/:id` - Get single report
- `DELETE /companies/:companyId/reports/:id` - Delete report
- `POST /companies/:companyId/reports/eod` - Generate EOD PDF
- `POST /companies/:companyId/reports/import-summary` - Generate import summary PDF
- `GET /companies/:companyId/reports/:id/download` - Download PDF

### Notifications
- `GET /companies/:companyId/notifications/config` - List configs
- `POST /companies/:companyId/notifications/config` - Create config
- `GET /companies/:companyId/notifications/config/:id` - Get config
- `PATCH /companies/:companyId/notifications/config/:id` - Update config
- `DELETE /companies/:companyId/notifications/config/:id` - Delete config
- `POST /companies/:companyId/notifications/config/:id/test` - Send test notification

### Agent Runs
- `GET /companies/:companyId/runs` - List runs with filters
- `GET /companies/:companyId/runs/stats` - Run statistics
- `GET /companies/:companyId/runs/:id` - Get single run
- `GET /companies/:companyId/runs/:id/tags` - Get run tags
- `POST /companies/:companyId/runs/:id/tags` - Add tag to run
- `DELETE /companies/:companyId/runs/:id/tags/:tagId` - Remove tag from run

### Bulk Operations
- `POST /companies/:companyId/agents/bulk-import` - Import from GitHub repos
- `POST /companies/:companyId/agents/bulk` - Bulk enable/disable/terminate
- `GET /companies/:companyId/agents/comparison` - Cross-repo comparison

## WebSocket Events

The dashboard subscribes to live events for real-time updates:

- `agent.run.started` - New run initiated
- `agent.run.completed` - Run finished successfully
- `agent.run.failed` - Run failed or timed out
- `agent.run.stuck` - Run stuck/unresponsive
- `agent.finding.created` - New security finding discovered
- `agent.report.generated` - New report available

## Database Schema

### New Tables

- `agent_findings` - Security findings with severity, category, verification
- `agent_reports` - Generated reports with type and PDF URL
- `notification_configs` - Notification destinations and event subscriptions
- `agent_run_tags` - Many-to-many tags for runs

## Testing

Run the test suite:

```bash
cd server
npx vitest run src/__tests__/findings-routes.test.ts
npx vitest run src/__tests__/reports-routes.test.ts
npx vitest run src/__tests__/notifications-routes.test.ts
npx vitest run src/__tests__/agent-runs-routes.test.ts
npx vitest run src/__tests__/findings-service.test.ts
npx vitest run src/__tests__/notifications-service.test.ts
npx vitest run src/__tests__/webhook-sender.test.ts
```

## Architecture

```
Frontend (React + TanStack Query)
  ↓
API Client (ui/src/api/*.ts)
  ↓
REST API (server/src/routes/*.ts)
  ↓
Services (server/src/services/*.ts)
  ↓
Database (Drizzle ORM + SQLite)
  ↓
WebSocket Events (server/src/services/live-events.ts)
```

## Implementation Phases

1. **DB Schema** - Created 4 new tables with proper indexing
2. **Backend Services** - Implemented CRUD services with activity logging
3. **API Routes** - Added REST endpoints with company access control
4. **WebSocket Events** - Added 6 new live event types for real-time updates
5. **Frontend Dashboard** - Built tabbed UI with 6 panels
6. **Report Generation** - Added puppeteer-core PDF generation with templates
7. **Notifications** - Added Telegram webhook sender and daily digest scheduler
8. **Bulk Operations** - Added GitHub import, bulk actions, and comparison
9. **Testing** - Added 50 unit and integration tests
10. **Polish** - Added JSDoc comments and documentation
