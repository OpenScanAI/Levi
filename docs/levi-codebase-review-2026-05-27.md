# Levi codebase review — 2026-05-27

This review captures concrete improvement findings from a working session that ran end-to-end on the OPEA Paperclip instance at `agi.openscan.ai`: shipped the Kimi K2.6 adapter and Claude→Kimi fallback (PRs [#25](https://github.com/OpenScanAI/Levi/pull/25) / [#26](https://github.com/OpenScanAI/Levi/pull/26)), then ran a real Kimi-backed Founder run on OPEA-7 and a Kimi-backed CTO run on OPEA-18 once Claude exhausted its 5-hour cap.

Closes OPEA-18.

## Findings

Most foundational gaps are already tracked as Levi issues [#27–#41](https://github.com/OpenScanAI/Levi/issues/42) per the upstream survey. **This review adds the findings that surfaced from real operation today** — gaps the upstream survey could not see.

### F1. `pnpm run build` does not copy `ui/dist` into `server/ui-dist`

**Symptom observed**: I rebuilt the UI to expose the `kimi_local` adapter in the dropdown. The hash in `ui/dist/index.html` changed; the hash in `server/ui-dist/index.html` did not. Production kept serving the old bundle (without `kimi_local`) until I manually ran `bash scripts/prepare-server-ui-dist.sh`.

**Root cause**: `server/package.json` runs `prepare:ui-dist` only as part of `prepack` (publish-to-npm), not as part of the regular build chain. Self-hosted operators using `pnpm run build && node server/dist/index.js` get a stale UI without realizing it.

**Fix in this PR**: add a `postbuild` hook in `server/package.json` that runs `prepare:ui-dist`. Existing operators who run `pnpm run build` get the fresh UI automatically.

### F2. PATCH `/api/agents/:id` adapterConfig is wholesale-replace, not merge

**Symptom observed**: I PATCHed an agent with `{ adapterConfig: { fallback: {...} } }` to add a single field. The response showed only `fallback` in `adapterConfig` — every other field (`model`, `command`, `instructionsFilePath`, `dangerouslySkipPermissions`, etc.) had been wiped to null.

**Implication**: any client wanting to update a single field of `adapterConfig` must first GET, merge locally, and PATCH the full object back. A typo or stale GET wipes the agent's config silently.

**Recommendation** (out of scope for this PR): either (a) deep-merge `adapterConfig` by default and require `replaceAdapterConfig: true` to wipe; OR (b) document the wholesale-replace semantics prominently in `docs/api/agents.md`. Today neither is true. Worth a separate issue.

### F3. Claude CLI can hang silently on rate-limit instead of exiting

**Symptom observed**: With Claude rate-limited, four CTO runs failed fast (~1.5s each) with `claude_transient_upstream`. The fifth run **hung for 18 minutes** with `claude` PID at 0% CPU, no network connections, no exit, no output after the initial second.

**Implication for the Kimi fallback in PR #26**: the fallback path only fires when claude *exits* with a quota signal. A hung claude leaves the heartbeat in `running` indefinitely; the fallback never engages. Manual operator intervention required (kill PID).

**Already tracked**: Levi [#28](https://github.com/OpenScanAI/Levi/issues/28) (treat ConnectionRefused as transient + rotate session after N adapter_failed) and [#35](https://github.com/OpenScanAI/Levi/issues/35) (silence-detector auto-cancel-on-dead-PID) together fix this. **Recommend prioritizing them — together they close the gap between "fallback exists" and "fallback always engages."**

### F4. Kimi fallback is default-off; bulk-enable is awkward

**Symptom observed**: PR #26 ships the fallback *capability* but each agent must opt in via `adapterConfig.fallback.enabled: true`. With ~190 agents in OPEA, enabling fallback on all of them requires 190 individual PATCH calls (or a script). When Claude rate-limited mid-session today, only the test agent that I had explicitly configured benefited — every other agent including CTO failed until I manually patched.

**Recommendations** (worth follow-up issues):
- Add a company-level default `defaultAdapterConfig.fallback` that new agents inherit
- Add a batch endpoint `POST /api/companies/:id/agents/batch-update` for fleet operations
- Make `fallback.enabled: true` the default when the operator has configured a Kimi key

### F5. Cost reporting under-counts Moonshot/Kimi spend

**Symptom observed**: every Kimi run completes with `usageJson.inputTokens: 0`, `outputTokens: 0`, `costUsd: 0` even though Moonshot is actually billing for the spend.

**Root cause**: the minimal stream-json parser in `packages/adapters/claude-local/src/server/kimi-fallback.ts` (or the kimi-local adapter parser) doesn't extract usage from the Kimi proxy's stream-json shape — either because the proxy doesn't emit it, or because our parser doesn't read the right field.

**Recommendation**: either parse Moonshot's usage shape, OR call `GET https://api.kimi.com/coding/v1/usage` after each run to back-fill. Tracked as a follow-up; pairs naturally with Levi issue [#27](https://github.com/OpenScanAI/Levi/issues/27) (subscription_included cost_events=0 bug).

### F6. No built-in static-preview for agent workspaces

**Symptom observed**: An agent built a static "Hello World" HTML/JS app in its workspace. There was no built-in way to view it; I had to add an nginx `/preview/` location manually and `chmod o+x /root` so `www-data` could traverse.

**Already partially addressed**: PR [#44](https://github.com/OpenScanAI/Levi/pull/44) added a `Preview` button on the agent header that links to the nginx-served `/preview/<agent-id>/`. But the nginx setup is operator-managed and not documented anywhere in the repo.

**Fix in this PR**: add `docs/deploy/levi-operations.md` capturing the operational setup (nginx, kimi-cli, `/root` perms, logrotate cap on `/var/log/syslog`).

### F7. Manager-role agents executed instead of delegating

**Symptom observed**: CTO assigned OPEA-14 (build an IPL website) attempted to build it personally despite having 10+ engineering specialists reporting to him.

**Already addressed**: PR [#43](https://github.com/OpenScanAI/Levi/pull/43) added a `## Delegate vs Execute (Manager-Role Default)` section to the shared paperclip skill + a rewritten CTO `AGENTS.md`. Validated: CTO now creates child issues + delegates instead of executing.

### F8. Syslog disk-runaway is not a paperclip bug, but it bites paperclip-hosted instances

**Symptom observed**: Twice in 7 hours, `/var/log/syslog` ballooned past 350 GiB from an nginx connect-refused flood (unrelated upstream down). Filled `/dev/md2`, took Postgres offline, took Paperclip offline. Manual recovery each time was ~5 min downtime.

**Fix in this PR**: capture the durable mitigation (hourly logrotate cron + `su root syslog` directive) in `docs/deploy/levi-operations.md` so a fresh Levi deploy doesn't trip the same wire.

## What ships in THIS PR

| File | Purpose |
|---|---|
| `docs/levi-codebase-review-2026-05-27.md` | This document |
| `docs/deploy/levi-operations.md` | Captures all the operational setup steps for a Levi deploy (preview nginx, kimi-cli config, /root perms, logrotate cap, fallback bulk-enable command) |
| `server/package.json` | Add `postbuild` hook running `prepare:ui-dist` (F1 fix) |

## Recommended follow-ups (separate PRs, not this one)

- [F2] Deep-merge semantics for adapterConfig PATCH — open issue
- [F3] Track and prioritize [#28](https://github.com/OpenScanAI/Levi/issues/28) and [#35](https://github.com/OpenScanAI/Levi/issues/35)
- [F4] Company-level default fallback config + bulk agent endpoint
- [F5] Moonshot usage parser fix (pairs with [#27](https://github.com/OpenScanAI/Levi/issues/27))
