# OpenScanAI (OPEA) — agent instructions

This directory tracks the AGENTS.md files for the OPEA Paperclip instance running at https://agi.openscan.ai.

Each file is the per-agent system prompt the Paperclip heartbeat runner stages into the agents execution workspace. They live here in version control so:

- changes are reviewed before they land
- regressions can be diffed
- a fresh Levi deploy can re-seed an instance from this directory

## Layout

```
companies/opea/agents/<url-key>/AGENTS.md
```

where `<url-key>` matches the agents `urlKey` field (also the slug in `agi.openscan.ai/OPEA/agents/<url-key>`).

## Runtime path on the host

Paperclip reads each agents instructions from:

```
/root/.paperclip/instances/default/companies/24368a80-713a-4888-922b-2e7566193ef7/agents/<agent-uuid>/instructions/AGENTS.md
```

These are operator-managed files. When a change lands on this PR, copy the file from the repo into that runtime path to apply it.

## Recent behaviour changes worth knowing

- **CTO is now delegation-first** (see `cto/AGENTS.md`). Default action on any non-architecture task is to identify the right specialist on the team, create a child issue, and assign. Self-execution is the exception. Matched in `skills/paperclip/SKILL.md` by a new `## Delegate vs Execute (Manager-Role Default)` section that applies the same rule to any role in {ceo, cto, manager, lead}.
