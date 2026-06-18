# GitHub Integration Plugin

Bidirectional sync between Paperclip issues and GitHub issues/PRs.

## Quick Start

### 1. Installation

The plugin is bundled with Levi. Enable it via the Paperclip board:

```
Board → Plugins → GitHub Integration → Install
```

### 2. Configuration

Required config fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `githubRepo` | string | Yes | Repository in `owner/repo` format |
| `githubTokenSecretRef` | secret-ref | Yes | Secret reference for GitHub PAT |
| `defaultCompanyId` | string | Yes | Company ID for scoped operations |

Optional config fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `githubApiBase` | string | `https://api.github.com` | Override for GitHub Enterprise |
| `statusMapping` | string | `{"backlog":"open","done":"closed"}` | JSON mapping of statuses |
| `enablePrOnDone` | boolean | `false` | Auto-create PR when issue marked done |
| `githubWebhookSecretRef` | secret-ref | — | Secret for webhook signature verification |

### 3. Running

After configuration, the plugin auto-starts. Verify health:

```bash
curl http://localhost:3100/api/plugins/github-integration/health
```

## Webhook Setup

To receive GitHub events:

1. Go to your GitHub repo → Settings → Webhooks
2. Add webhook URL: `https://your-paperclip-instance/api/plugins/github-integration/webhooks/github-webhook`
3. Content type: `application/json`
4. Secret: matching `githubWebhookSecretRef` value
5. Events: Issues, Issue comments

## Manual Testing

### Test 1: Create GitHub issue from Paperclip

```bash
curl -s -X POST http://localhost:3100/api/plugins/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "github-integration:github_create_issue",
    "parameters": {
      "title": "Test issue",
      "body": "Testing bidirectional sync"
    },
    "runContext": {
      "agentId": "your-agent-id",
      "runId": "your-run-id",
      "companyId": "your-company-id",
      "projectId": "your-project-id"
    }
  }'
```

Expected: `Created GitHub issue #N: https://github.com/owner/repo/issues/N`

### Test 2: Sync status

```bash
curl -s -X POST http://localhost:3100/api/plugins/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "github-integration:github_sync_status",
    "parameters": {
      "paperclipIssueId": "your-issue-id"
    },
    "runContext": {
      "agentId": "your-agent-id",
      "runId": "your-run-id",
      "companyId": "your-company-id",
      "projectId": "your-project-id"
    }
  }'
```

Expected: `GitHub issue #N is open/closed`

### Test 3: Webhook delivery

```bash
curl -s -X POST http://localhost:3100/api/plugins/github-integration/webhooks/github-webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -d '{
    "action": "closed",
    "issue": {
      "number": 1,
      "state": "closed",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  }'
```

Expected: Paperclip issue status updates to `done`

## Architecture

```
Paperclip Issue → Event Bus → Plugin Worker → GitHub API
     ↑                                              ↓
     └────────── Webhook / Sync Job ←───────────────┘
```

## Capabilities Used

- `issues.read` / `issues.create` / `issues.update` — issue CRUD
- `issue.comments.create` / `issue.comments.read` — comment sync
- `plugin.state.read` / `plugin.state.write` — mapping persistence
- `events.subscribe` — Paperclip event handling
- `jobs.schedule` — periodic sync (every 6 hours)
- `http.outbound` — GitHub API calls
- `secrets.read-ref` — token resolution
- `webhooks.receive` — GitHub webhook handling
- `agent.tools.register` — agent tools

## State Storage

Plugin stores mappings in `ctx.state` with `instance` scope:

- `issue-mappings`: Paperclip ID → GitHub issue number
- `reverse-mappings`: GitHub issue number → Paperclip ID
- `sync-state`: Last updated timestamps for conflict resolution
- `last-sync`: Last sync job run timestamp

## Conflict Resolution

Timestamp-based last-write-wins:

- Paperclip → GitHub: skips if GitHub version is newer
- GitHub → Paperclip: skips if Paperclip version is newer
- Sync job: skips if Paperclip version is newer

## Rate Limiting

- Tracks `X-RateLimit-Remaining` header
- Waits until reset when limit exceeded
- Exponential backoff on 5xx errors (max 3 retries)

## Security

- Webhook signatures verified via HMAC-SHA256
- Secrets resolved via Paperclip secret service
- No API keys exposed in logs or state

## Limitations

- PRs are empty branches — code push requires human/agent
- No auto-merge capability
- Comment threading models differ (flat vs nested)

## License

MIT
