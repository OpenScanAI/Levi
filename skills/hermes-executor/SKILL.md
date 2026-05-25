---
name: hermes-executor
description: >
  Execute tasks via Hermes bridge. When an issue requires code changes,
  terminal commands, or file edits, label it for Hermes execution.
  Hermes will read the issue, fix the code, test it, and create a PR.
---

# Hermes Executor Skill

Use this skill when an issue requires code execution that Paperclip agents cannot perform.

## When to Use

Use Hermes execution when the task involves:
- Editing source code files
- Running terminal commands (build, test, lint)
- Taking screenshots for UI verification
- Creating Git branches and PRs
- Any file system operation

## Workflow

### Step 1: Label Issue for Hermes

Add the `hermes-execution` label to the GitHub issue:

```sh
curl -sS -X PATCH "https://api.github.com/repos/<owner>/<repo>/issues/<issue-number>" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels": ["hermes-execution"]}'
```

### Step 2: Hermes Bridge Picks It Up

The Hermes bridge (running as a daemon) will:
1. Poll GitHub for issues with `hermes-execution` label
2. Read the issue description and acceptance criteria
3. Execute the fix using file tools, terminal, and browser
4. Test the changes (build, screenshots, console errors)
5. Create a PR with proper description
6. Report results back to the issue

### Step 3: Track Progress

Hermes will post status updates to the issue:
- `[IN_PROGRESS] Hermes is working on this issue...`
- `[DONE] Task completed. PR: #xxx`
- `[FAILED] Task failed. Error: ...`

### Step 4: Paperclip Updates Status

When Hermes reports completion:
1. Update Paperclip issue status to `in_review`
2. Link the PR
3. Notify user via Telegram

## Communication Format

### Paperclip -> Hermes (via GitHub Issue)

The issue body should include:
- Clear description of the bug/feature
- Acceptance criteria checklist
- File paths that need changes
- Expected behavior

Example:
```markdown
## Bug: Like button shows NaN

### Description
When localStorage has no `likeCount`, the like button shows "NaN".

### Acceptance Criteria
- [ ] Like button shows 0 when localStorage is empty
- [ ] Animation still works
- [ ] Toast notification appears

### Files to Check
- components/SwipeCard.tsx (line 47)
```

### Hermes -> Paperclip (via GitHub Comment)

Hermes posts structured comments:
```markdown
## ✅ Task Completed

Fixed NaN in like button by adding fallback:
```typescript
const count = localStorage.getItem('likeCount') ?? '0';
```

**PR:** https://github.com/owner/repo/pull/101

**Testing:**
- ✅ Build passes
- ✅ No console errors
- ✅ Screenshot verified

---
*Executed by Hermes Bridge*
```

## Multi-Project Support

Hermes bridge can monitor multiple repositories:

```bash
# Terminal 1: Monitor xShorts.News
npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/xShorts.News --poll

# Terminal 2: Monitor Paperclip
npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/Levi --poll

# Terminal 3: Monitor future project
npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/ProjectC --poll
```

Each bridge instance maintains its own state file.

## Configuration

### Environment Variables

```bash
# Required
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAPERCLIP_API_URL=http://localhost:3100
PAPERCLIP_API_KEY=pc_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Optional (for notifications)
TELEGRAM_BOT_TOKEN=xxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=xxxxxxxxxx

# Optional (bridge behavior)
BRIDGE_LABEL=hermes-execution        # Label to monitor
BRIDGE_POLL_INTERVAL=300000          # 5 minutes
BRIDGE_STATE_FILE=.hermes-bridge-state.json
```

### Running the Bridge

```bash
# Development (run once)
npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/xShorts.News --once

# Production (continuous polling)
npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/xShorts.News --poll

# Or use systemd service
systemctl --user start hermes-bridge
```

## Safety & Controls

1. **Approval Gates**: Hermes only creates PRs, never merges
2. **Dry Run Mode**: Test changes without creating PRs
3. **State Tracking**: Prevents duplicate execution
4. **Error Handling**: Failed tasks are reported, not retried automatically
5. **Scope Limit**: Hermes only modifies files in the project directory

## Example: Complete Two Friends Workflow

```
1. Paperclip detects bug in SwipeCard.tsx
   → Creates GitHub issue #100
   → Labels it: hermes-execution

2. Hermes Bridge polls and finds issue #100
   → Reads description
   → Plans fix
   → Edits SwipeCard.tsx
   → Runs build: npm run build
   → Takes screenshot
   → Creates PR #101
   → Posts comment: "Done! PR created"

3. Paperclip sees comment
   → Updates issue #100 status: in_review
   → Links PR #101

4. Telegram notification sent to user
   → "Issue #100 fixed. PR #101 ready for review"

5. User reviews PR
   → Approves and merges
   → Done! ✅
```

## References

- Hermes Bridge script: `scripts/hermes-bridge.ts`
- Bridge state file: `.hermes-bridge-state.json`
