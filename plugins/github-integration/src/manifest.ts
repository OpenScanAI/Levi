import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "github-integration";
const PLUGIN_VERSION = "0.1.0";
const JOB_KEY_SYNC = "github-sync";
const WEBHOOK_KEY_GITHUB = "github-webhook";
const TOOL_NAME_CREATE_ISSUE = "github_create_issue";
const TOOL_NAME_SYNC_STATUS = "github_sync_status";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "GitHub Integration",
  description: "Bidirectional sync between Paperclip issues and GitHub issues/PRs",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.create",
    "issue.comments.read",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "events.subscribe",
    "http.outbound",
    "secrets.read-ref",
    "webhooks.receive",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      githubRepo: {
        type: "string",
        title: "GitHub Repository",
        description: "Repository in owner/repo format (e.g., OpenScanAI/Levi)",
        default: "",
      },
      githubApiBase: {
        type: "string",
        title: "GitHub API Base URL",
        description: "Override for GitHub Enterprise",
        default: "https://api.github.com",
      },
      statusMapping: {
        type: "string",
        title: "Status Mapping JSON",
        description: 'JSON mapping of Paperclip statuses to GitHub states, e.g. {"backlog":"open","done":"closed"}',
        default: "",
      },
      enablePrOnDone: {
        type: "boolean",
        title: "Create PR on Done",
        description: "Automatically create a PR when an issue is marked done",
        default: false,
      },
      githubTokenSecretRef: {
        type: "string",
        format: "secret-ref",
        title: "GitHub Token Secret",
        description: "Secret UUID reference for the GitHub personal access token",
        default: "",
      },
      githubWebhookSecretRef: {
        type: "string",
        format: "secret-ref",
        title: "GitHub Webhook Secret",
        description: "Secret for verifying X-Hub-Signature-256 on incoming GitHub webhooks",
        default: "",
      },
      defaultCompanyId: {
        type: "string",
        title: "Default Company ID",
        description: "Company ID to use for secret resolution and scoped operations",
        default: "",
      },
    },
    required: ["githubRepo"],
  },
  jobs: [
    {
      jobKey: JOB_KEY_SYNC,
      displayName: "GitHub Sync",
      description: "Periodic bidirectional sync with GitHub issues",
      schedule: "0 */6 * * *",
    },
  ],
  webhooks: [
    {
      endpointKey: WEBHOOK_KEY_GITHUB,
      displayName: "GitHub Webhook",
      description: "Receive GitHub issue/PR event webhooks",
    },
  ],
  tools: [
    {
      name: TOOL_NAME_CREATE_ISSUE,
      displayName: "Create GitHub Issue",
      description: "Create a GitHub issue from an agent tool call",
      parametersSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
    {
      name: TOOL_NAME_SYNC_STATUS,
      displayName: "Sync GitHub Status",
      description: "Manually trigger status sync for a specific issue",
      parametersSchema: {
        type: "object",
        properties: {
          paperclipIssueId: { type: "string" },
        },
        required: ["paperclipIssueId"],
      },
    },
  ],
};

export default manifest;
