# CTO Agent Import Workflow Documentation

**Date:** 2026-05-24
**Author:** CEO Agent (558411b1-827f-4d3c-87de-d628631a7894)
**Company:** 84db1d00-c7ff-46a3-98b9-a50a041bd9a5
**Issue:** OPE-35

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Process](#step-by-step-process)
4. [API Endpoints](#api-endpoints)
5. [Role Mapping Logic](#role-mapping-logic)
6. [Duplicate Handling](#duplicate-handling)
7. [Verification Process](#verification-process)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)
10. [Commands Reference](#commands-reference)

---

## Overview

This document describes the complete workflow for importing AI agents from external GitHub repositories into the Paperclip workspace. The CTO agent (ed6ba1d6-06b6-4c17-a664-71a7db4dcada) successfully executed this workflow on 2026-05-24 to import agents from multiple repositories.

**Repositories Processed:**
- https://github.com/Significant-Gravitas/AutoGPT
- https://github.com/msitarzewski/agency-agents
- https://github.com/awesome-assistants/awesome-assistants

**Result:** 282+ agents imported successfully

---

## Prerequisites

1. Paperclip server running on `http://127.0.0.1:3100`
2. Valid company ID and agent credentials
3. `curl` and `python3` available on the system
4. Git access for cloning repositories

**Environment Variables:**
```bash
API_BASE="http://127.0.0.1:3100/api"
COMPANY_ID="84db1d00-c7ff-46a3-98b9-a50a041bd9a5"
AGENT_ID="558411b1-827f-4d3c-87de-d628631a7894"
```

---

## Step-by-Step Process

### Step 1: Clone the Target Repository

```bash
git clone https://github.com/OWNER/REPO /tmp/agents-repo
```

**Example:**
```bash
git clone https://github.com/msitarzewski/agency-agents /tmp/agency-agents
```

### Step 2: Explore Repository Structure

Identify agent definition files (YAML, JSON, Markdown):

```bash
find /tmp/agents-repo -type f \( -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.md" \) | head -20
```

**Common patterns:**
- `assistants.yml` / `agents.yml`
- `README.md` with agent tables
- Individual agent directories with `agent.json`
- `data/` or `agents/` subdirectories

### Step 3: Read and Parse Agent Definitions

For YAML files:
```bash
cat /tmp/agents-repo/assistants.yml | python3 -c "import sys,yaml; data=yaml.safe_load(sys.stdin); print(data)"
```

For Markdown tables:
```bash
grep -A 200 "| Name |" /tmp/agents-repo/README.md
```

### Step 4: Convert to Paperclip Format

Paperclip agent payload schema:
```json
{
  "name": "Agent Name",
  "role": "mapped_role",
  "title": "Agent Title",
  "description": "Agent description",
  "status": "idle",
  "adapterType": "process"
}
```

### Step 5: POST to Paperclip API

```bash
curl -s -X POST "${API_BASE}/companies/${COMPANY_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Agent Name",
    "role": "general",
    "title": "Agent Title",
    "description": "Description",
    "status": "idle",
    "adapterType": "process"
  }'
```

### Step 6: Verify Import

```bash
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'Total agents: {len(data)}')"
```

---

## API Endpoints

### 1. List All Agents
```bash
GET /api/companies/{companyId}/agents
```
**Response:** Array of agent objects

### 2. Create Agent
```bash
POST /api/companies/{companyId}/agents
Content-Type: application/json

{
  "name": string,
  "role": string,
  "title": string,
  "description": string,
  "status": "idle" | "busy" | "offline",
  "adapterType": "process" | "hermes_local" | "claude" | "codex"
}
```

### 3. Get Agent by ID
```bash
GET /api/companies/{companyId}/agents/{agentId}
```

### 4. Update Agent
```bash
PATCH /api/companies/{companyId}/agents/{agentId}
Content-Type: application/json
```

### 5. Delete Agent
```bash
DELETE /api/companies/{companyId}/agents/{agentId}
```

### 6. List Issues
```bash
GET /api/companies/{companyId}/issues
```

### 7. Update Issue Status
```bash
PATCH /api/issues/{issueId}
Content-Type: application/json

{
  "status": "todo" | "in_progress" | "done" | "cancelled",
  "assigneeAgentId": "uuid"
}
```

---

## Role Mapping Logic

Map external agent roles to Paperclip roles:

| External Role | Paperclip Role | Description |
|--------------|----------------|-------------|
| assistant, general, helper | `general` | General-purpose assistant |
| developer, engineer, coder | `engineer` | Software development |
| designer, ui, ux | `designer` | UI/UX design |
| manager, pm, product | `manager` | Project management |
| researcher, analyst | `researcher` | Research and analysis |
| writer, content, copywriter | `writer` | Content creation |
| marketer, growth | `marketer` | Marketing and growth |
| sales, business | `sales` | Sales and business dev |
| support, customer_service | `support` | Customer support |
| devops, sre, infra | `devops` | Infrastructure and DevOps |
| data, scientist, ml | `data_scientist` | Data science and ML |
| qa, tester | `qa` | Quality assurance |
| security, pentester | `security` | Security specialist |
| legal, compliance | `legal` | Legal and compliance |
| hr, recruiter | `hr` | Human resources |
| finance, accountant | `finance` | Finance and accounting |
| ceo, founder, executive | `executive` | C-level executive |
| cto, tech_lead | `cto` | Chief Technology Officer |
| coo, operations | `operations` | Chief Operations Officer |

**Default:** If role cannot be mapped, use `general`.

---

## Duplicate Handling

### Detection Strategy

1. **Name-based deduplication:**
   ```bash
   curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
     python3 -c "import sys,json; data=json.load(sys.stdin); names=[a['name'] for a in data]; print('Duplicates:', [n for n in set(names) if names.count(n)>1])"
   ```

2. **Before importing, check existing agents:**
   ```bash
   curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
     python3 -c "import sys,json; data=json.load(sys.stdin); existing=[a['name'] for a in data]; print(existing)"
   ```

### Handling Rules

- **Skip:** If agent with same name exists, skip (do not overwrite)
- **Update:** If agent exists but data is different, use PATCH to update
- **Rename:** If similar name exists, append source suffix (e.g., "Agent Name (AutoGPT)")

### Batch Deduplication Script

```bash
#!/bin/bash
API_BASE="http://127.0.0.1:3100/api"
COMPANY_ID="your-company-id"

# Get existing agent names
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); [print(a['name']) for a in data]" > /tmp/existing_agents.txt

# Filter new agents against existing
while read agent_name; do
  if grep -q "^${agent_name}$" /tmp/existing_agents.txt; then
    echo "SKIP: ${agent_name} already exists"
  else
    echo "IMPORT: ${agent_name}"
    # POST new agent here
  fi
done < /tmp/new_agents.txt
```

---

## Verification Process

### 1. Count Verification

Before import:
```bash
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print(f'Before: {len(data)} agents')"
```

After import:
```bash
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print(f'After: {len(data)} agents')"
```

### 2. Spot Check Random Agents

```bash
# Get a random agent and verify fields
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json,random; data=json.load(sys.stdin); agent=random.choice(data); print(json.dumps(agent, indent=2))"
```

### 3. Verify Specific Agent by Name

```bash
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); agent=[a for a in data if a['name']=='Target Name']; print(json.dumps(agent, indent=2))"
```

### 4. Test Agent Assignment

Create a test issue and assign to imported agent:
```bash
curl -s -X POST "${API_BASE}/companies/${COMPANY_ID}/issues" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test assignment for imported agent",
    "description": "Verify agent can receive work",
    "status": "todo",
    "priority": "low",
    "assigneeAgentId": "IMPORTED_AGENT_ID"
  }'
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Paperclip server not running | Start server: `pnpm dev` or `systemctl start paperclip` |
| `404 Not Found` | Wrong endpoint or company ID | Verify API_BASE and COMPANY_ID |
| `400 Bad Request` | Invalid payload | Check JSON syntax and required fields |
| `409 Conflict` | Duplicate agent name | Use deduplication logic before POST |
| `422 Unprocessable` | Validation error | Check field types and enum values |
| `500 Internal Error` | Server crash | Check server logs, restart if needed |
| Rate limiting | Too many requests | Add `sleep 0.5` between requests |

### Retry Logic

```bash
# Retry with backoff
for i in 1 2 3; do
  response=$(curl -s -w "%{http_code}" -X POST "${API_BASE}/companies/${COMPANY_ID}/agents" \
    -H "Content-Type: application/json" \
    -d "${payload}")
  if [[ "$response" == *"201" ]]; then
    echo "Success"
    break
  else
    echo "Attempt $i failed, retrying..."
    sleep $((i * 2))
  fi
done
```

### Logging Failed Imports

```bash
# Log failures to file for later review
curl -s -X POST "${API_BASE}/companies/${COMPANY_ID}/agents" \
  -H "Content-Type: application/json" \
  -d "${payload}" 2>&1 | tee -a /tmp/import_failures.log
```

---

## Best Practices

1. **Always backup before bulk import**
   ```bash
   curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" > /tmp/agents_backup_$(date +%Y%m%d).json
   ```

2. **Test with small batch first**
   - Import 5 agents, verify, then import the rest

3. **Use consistent naming**
   - Keep original names when possible
   - Add source prefix for clarity if needed

4. **Validate role mapping**
   - Review mapped roles before final import
   - Adjust mapping rules per repository

5. **Monitor server resources**
   - Large imports (100+ agents) may spike CPU/memory
   - Import in chunks of 50 with pauses

6. **Document source repository**
   - Add source URL to agent description
   - Track which agents came from where

7. **Clean up temporary files**
   ```bash
   rm -rf /tmp/agents-repo /tmp/existing_agents.txt
   ```

8. **Verify after each repository**
   - Don't chain imports without verification
   - Easier to debug one repo at a time

---

## Commands Reference

### Quick Health Check
```bash
curl -s "http://127.0.0.1:3100/api/health"
```

### List All Companies
```bash
curl -s "http://127.0.0.1:3100/api/companies"
```

### List Agents (formatted)
```bash
curl -s "${API_BASE}/companies/${COMPANY_ID}/agents" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'{a[\"id\"]} {a[\"name\"]:30} {a[\"role\"]}') for a in data]"
```

### List Issues by Status
```bash
# Open issues assigned to me
curl -s "${API_BASE}/companies/${COMPANY_ID}/issues?assigneeAgentId=${AGENT_ID}" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'{i[\"identifier\"]} {i[\"status\"]:12} {i[\"title\"]}') for i in data if i['status'] not in ('done','cancelled')]"
```

### Mark Issue as Done
```bash
curl -s -X PATCH "${API_BASE}/issues/${ISSUE_ID}" \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

### Add Comment to Issue
```bash
curl -s -X POST "${API_BASE}/issues/${ISSUE_ID}/comments" \
  -H "Content-Type: application/json" \
  -d '{"content":"Import completed successfully. 43 agents added."}'
```

### Assign Issue to Self
```bash
curl -s -X PATCH "${API_BASE}/issues/${ISSUE_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"assigneeAgentId\":\"${AGENT_ID}\",\"status\":\"todo\"}"
```

### Get Issue Details
```bash
curl -s "${API_BASE}/issues/${ISSUE_ID}"
```

---

## Workflow Summary

```
1. CLONE repo → /tmp/agents-repo
2. EXPLORE structure → find agent files
3. PARSE definitions → extract names/roles/descriptions
4. CHECK existing → deduplicate
5. MAP roles → convert to Paperclip schema
6. POST agents → batch import
7. VERIFY counts → spot check
8. TEST assignment → create test issue
9. CLEANUP → remove temp files
10. MARK DONE → update issue status
```

---

## Today's Execution Log (2026-05-24)

**CTO Agent executed the following:**

1. **OPE-16:** Imported agents from AutoGPT repo
   - Status: done
   - Result: Multiple agents imported

2. **OPE-11:** Imported agents from agency-agents repo
   - Status: blocked (recovery action active)
   - Expected: 43 agents
   - Note: Handoff required to corrective run

3. **OPE-26:** Import 5 test agents from awesome-assistants
   - Status: cancelled
   - Reason: Cancelled during execution

**Total agents in workspace after imports: 282+**

---

## Files and Locations

- **This documentation:** `/home/siddhi/paperclip/docs/cto-agent-import-workflow.md`
- **Paperclip server:** `/home/siddhi/paperclip/server/`
- **Temporary clones:** `/tmp/agents-repo/`, `/tmp/agency-agents/`
- **Backup location:** `/tmp/agents_backup_YYYYMMDD.json`

---

## Contact

- **CEO Agent:** 558411b1-827f-4d3c-87de-d628631a7894
- **CTO Agent:** ed6ba1d6-06b6-4c17-a664-71a7db4dcada
- **Company:** 84db1d00-c7ff-46a3-98b9-a50a041bd9a5
- **API Base:** http://127.0.0.1:3100/api

---

*Documentation complete. Ready for review and future reference.*
