---
name: agent-format-converter
description: >
  Convert external agent definitions from various formats (agency-agents,
  crewai, autogen, etc.) into Paperclip/Levi native schema. Handles field
  mapping, validation, and normalization.
  Use after github-repo-reader to prepare agents for import.
---

# Agent Format Converter Skill

Use this skill when converting external agent definitions to Paperclip/Levi schema.

## Input Format

Receives agent definitions from github-repo-reader:
```json
[
  {
    "source": "github",
    "sourceUrl": "...",
    "name": "MarketingAgent",
    "role": "marketing",
    "title": "Marketing Specialist",
    "description": "Handles marketing...",
    "capabilities": ["content creation", "campaign management"],
    "skills": ["copywriting", "analytics"],
    "adapterType": "process",
    "icon": "megaphone"
  }
]
```

## Output Format

Paperclip/Levi native schema:
```json
[
  {
    "name": "marketing-agent",
    "role": "marketing",
    "title": "Marketing Specialist",
    "icon": "megaphone",
    "reportsTo": null,
    "capabilities": "Content creation, campaign management, SEO optimization",
    "desiredSkills": ["copywriting", "analytics", "social-media"],
    "adapterType": "process",
    "adapterConfig": {},
    "instructionsBundle": {
      "files": {
        "AGENTS.md": "You are a Marketing Specialist agent..."
      }
    }
  }
]
```

## Field Mapping Rules

### name
- Input: Any string (e.g., "MarketingAgent", "marketing_agent")
- Output: kebab-case (e.g., "marketing-agent")
- Validation: Required, max 50 chars, alphanumeric + hyphens only

### role
- Input: Any string (e.g., "marketing", "seo-expert", "content_creator")
- Output: Lowercase, kebab-case
- Validation: Required, must be unique per workspace

### title
- Input: Any string or null
- Output: Title Case (e.g., "Marketing Specialist")
- Fallback: Derive from name if not provided

### icon
- Input: Any string or null
- Output: Must be from Paperclip icon library
- Mapping: Common icons:
  - "megaphone" → marketing
  - "code" → developer
  - "shield" → security
  - "chart" → analyst
  - "pen" → writer
  - "users" → hr
  - "dollar" → finance
  - "globe" → international
  - "crown" → executive
  - "cpu" → technical

### capabilities
- Input: Array of strings or single string
- Output: Single string, comma-separated
- Transformation: Capitalize first letter of each item

### desiredSkills
- Input: Array of strings or null
- Output: Array of skill references
- Mapping: Convert to Paperclip skill IDs if known, else keep as-is
- Format: "category/skill-name" or "skill-name"

### adapterType
- Input: Any string or null
- Output: One of Paperclip supported adapters
- Default: "process"
- Mapping:
  - "openai" → "openai"
  - "claude" → "claude_local"
  - "local" → "process"
  - "remote" → "process"
  - null → "process"

### adapterConfig
- Input: Object or null
- Output: Valid Paperclip adapter config
- Default: {}
- Validation: Must match schema for chosen adapterType

### instructionsBundle
- Input: String, object, or null
- Output: { files: { "AGENTS.md": "..." } }
- Transformation: Wrap description in AGENTS.md template

## AGENTS.md Template

```markdown
# <title>

## Role
<title> specializing in <capabilities>.

## Responsibilities
- <capability 1>
- <capability 2>
- <capability 3>

## Context
You are part of a team of AI agents working together on projects.
Report to your manager and collaborate with other agents.

## Boundaries
- Do not access production systems without approval
- Do not share confidential information
- Escalate issues you cannot resolve
```

## Validation Rules

1. **name**: Required, unique, kebab-case, max 50 chars
2. **role**: Required, unique, lowercase
3. **title**: Required, max 100 chars
4. **icon**: Must be from allowed icon list
5. **adapterType**: Must be supported by Paperclip instance
6. **capabilities**: Max 500 chars
7. **desiredSkills**: Max 20 skills

## Error Handling

- Invalid field → Set default or skip with warning
- Duplicate name/role → Append number (e.g., "marketing-agent-2")
- Unsupported adapter → Fall back to "process"
- Missing required field → Return error with field name

## References

- Paperclip adapter configs: API endpoint /llms/agent-configuration.txt
- Allowed icons: API endpoint /llms/agent-icons.txt
- Skill library: API endpoint /api/companies/{id}/skills
