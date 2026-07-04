# @paperclipai/plugin-github-integration

GitHub integration plugin for Paperclip.

## What It Does

- Listens for `issue.created` events in Paperclip
- Creates corresponding issues in GitHub
- Stores sync state to track which Paperclip issues have been synced

## Configuration

Required plugin settings:
- `githubTokenRef`: Secret reference to your GitHub Personal Access Token
- `githubOwner`: GitHub repository owner (user or organization)
- `githubRepo`: GitHub repository name

## Local Development

```bash
pnpm build
pnpm paperclipai plugin install ./packages/plugins/plugin-github-integration
```
