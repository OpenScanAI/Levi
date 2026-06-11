---
name: github-repo-reader
description: >
  Fetch and parse agent definitions from public GitHub repositories.
  Extracts agent metadata, roles, capabilities, and configuration from
  README files, agent definition files, and repository structure.
  Use when importing external agents into Paperclip/Levi.
---

# GitHub Repo Reader Skill

Use this skill when you need to read agent definitions from a public GitHub repository.

## Supported Repository Formats

### Format 1: README-based (agency-agents style)
- `README.md` contains agent definitions in structured sections
- Each agent has: name, role, description, capabilities

### Format 2: JSON/YAML definitions
- `agents.json` or `agents.yaml` contains structured agent data
- Each entry has: name, role, description, skills, config

### Format 3: Directory-based
- Each agent has its own directory: `agents/<agent-name>/`
- Contains: `README.md`, `config.json`, `prompt.md`

## Workflow

### Step 1: Validate GitHub URL

```sh
# Extract owner and repo from URL
# Input: https://github.com/owner/repo
# Output: owner, repo name
```

### Step 2: Fetch Repository Contents

```sh
# GitHub API - list root contents
curl -sS "https://api.github.com/repos/<owner>/<repo>/contents" \
  -H "Accept: application/vnd.github.v3+json"

# GitHub API - get README
curl -sS "https://api.github.com/repos/<owner>/<repo>/readme" \
  -H "Accept: application/vnd.github.v3+json"

# GitHub API - get raw file content
curl -sS "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>"
```

### Step 3: Parse Agent Definitions

For README-based repos:
- Parse markdown headers (## Agent Name)
- Extract bullet points under each agent section
- Map common patterns:
  - "Role:" or "**Role:**" → role
  - "Description:" or "**Description:**" → description
  - "Capabilities:" or "**Capabilities:**" → capabilities
  - "Skills:" or "**Skills:**" → skills

For JSON/YAML repos:
- Parse structured data directly
- Validate schema: name, role, description required

### Step 4: Normalize and Return

Return array of agent definitions:
```json
[
  {
    "source": "github",
    "sourceUrl": "https://github.com/owner/repo",
    "name": "MarketingAgent",
    "role": "marketing",
    "title": "Marketing Specialist",
    "description": "Handles marketing campaigns and content strategy",
    "capabilities": ["content creation", "campaign management", "SEO"],
    "skills": ["copywriting", "analytics", "social media"],
    "adapterType": "process",
    "icon": "megaphone"
  }
]
```

## Error Handling

- Invalid URL → Return error with expected format
- Repo not found → Return 404 error
- No agent definitions found → Return empty array with warning
- Rate limited → Use authenticated requests or retry with backoff

## References

- GitHub API docs: https://docs.github.com/en/rest
- Example repo: https://github.com/msitarzewski/agency-agents
