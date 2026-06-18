# GitHub Integration Plugin — Architecture

## System Overview

```
┌─────────────────┐     Events      ┌──────────────────┐
│   Paperclip     │ ───────────────→│  Plugin Worker   │
│   (Issue Mgmt)  │←────────────────│  (This Plugin)   │
└─────────────────┘    Webhooks     └──────────────────┘
                                              │
                                              │ HTTP
                                              ↓
                                       ┌──────────────┐
                                       │  GitHub API  │
                                       │(Issues/PRs)  │
                                       └──────────────┘
```

## Data Flow

### Paperclip → GitHub (Push)

```
issue.created ──→ create GitHub issue ──→ store mapping
issue.updated ──→ update GitHub issue ──→ update sync state
issue.comment.created ──→ create GitHub comment
issue.status=done ──→ create branch ──→ create PR
```

### GitHub → Paperclip (Pull)

```
Webhook: issues ──→ update Paperclip status
Webhook: issue_comment ──→ create Paperclip comment
Sync Job (6hr) ──→ batch update all statuses
```

## State Storage

```
ctx.state (instance scope)
├── issue-mappings       { paperclipId → githubNumber }
├── reverse-mappings     { githubNumber → paperclipId }
├── sync-state           { paperclipId → { githubUpdatedAt, paperclipUpdatedAt } }
└── last-sync            timestamp
```

## Conflict Resolution

```
Paperclip update → check sync-state.githubUpdatedAt
                → if GitHub newer → skip (would overwrite)
                → if Paperclip newer → proceed

GitHub webhook → check sync-state.paperclipUpdatedAt
              → if Paperclip newer → skip
              → if GitHub newer → proceed
```

## Security

```
Webhook → verify HMAC-SHA256 signature
        → reject if mismatch
        → log warning if no secret configured

Secrets → resolve via Paperclip secret service
        → company-scoped with binding check
        → no keys exposed in logs/state
```

## Rate Limiting

```
GitHub API call → check X-RateLimit-Remaining
               → if 0 → wait until X-RateLimit-Reset
               → if 5xx → retry with exponential backoff (max 3)
```

## Component Diagram

```
┌─────────────────────────────────────────┐
│           Plugin Worker                 │
│  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │  setup  │  │onWebhook│  │ sync   │ │
│  │  hook   │  │ handler │  │  job   │ │
│  └────┬────┘  └────┬────┘  └───┬────┘ │
│       └─────────────┴───────────┘      │
│                   │                     │
│              ┌────┴────┐               │
│              │ Octokit │               │
│              │ Client  │               │
│              └────┬────┘               │
│                   │                     │
│              ┌────┴────┐               │
│              │ GitHub  │               │
│              │  API    │               │
│              └─────────┘               │
└─────────────────────────────────────────┘
```

## Module Structure

```
src/
├── manifest.ts    # Plugin declaration (capabilities, tools, jobs, webhooks)
└── worker.ts      # All logic:
                   #   - setup() initializes Octokit + event handlers
                   #   - onWebhook() handles GitHub events
                   #   - sync job runs every 6 hours
                   #   - tools exposed to agents
```

## Key Design Decisions

1. **Module-level state** — `onWebhook` runs outside `setup` context, so shared state (octokit, config, mappings) is stored in module-level variables set during `setup()`.

2. **Timestamp-based conflict resolution** — Last-write-wins prevents sync loops when both systems are edited simultaneously.

3. **Graceful degradation** — If GitHub token is missing, plugin logs warning and skips API calls. If webhook secret is missing, webhooks are accepted but logged.

4. **Empty PR branches** — PR creation creates branch from default branch SHA. Code push is intentionally left to human/agent (security boundary).

## Troubleshooting

### "Plugin running in degraded mode"
→ `githubTokenSecretRef` not configured or secret not found. Check:
1. Secret exists in Paperclip company
2. `company_secret_bindings` table has binding row
3. `defaultCompanyId` in plugin config matches company

### "Invalid secret reference"
→ Secret name doesn't exist or UUID is wrong. Check `secrets.getByName()` returns a result.

### "Secret is not bound to plugin"
→ Missing row in `company_secret_bindings`. Insert directly via DB:
```sql
INSERT INTO company_secret_bindings 
(company_id, secret_id, target_type, target_id, config_path)
VALUES ('company-uuid', 'secret-uuid', 'plugin', 'plugin-uuid', 'plugin.secrets.resolve');
```

### "Cannot execute tool — worker not running"
→ `pluginDbId` mismatch between tool registry and worker manager. Check `plugin-tool-dispatcher.ts` passes `pluginDbId` to `registerPlugin()`.

### Webhook not updating Paperclip
→ Check webhook URL is correct and GitHub webhook secret matches `githubWebhookSecretRef`.

### Rate limit errors
→ Plugin handles automatically. If persistent, check GitHub PAT has sufficient quota (5000 req/hour for free accounts).

## Testing

```bash
# Unit tests
cd plugins/github-integration && npx vitest run

# Manual test — create issue
curl -X POST http://localhost:3100/api/plugins/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"github-integration:github_create_issue","parameters":{"title":"Test"},"runContext":{"agentId":"...","companyId":"..."}}'

# Manual test — webhook
curl -X POST http://localhost:3100/api/plugins/github-integration/webhooks/github-webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -d '{"action":"closed","issue":{"number":1,"state":"closed"}}'
```
