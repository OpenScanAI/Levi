import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.github-integration";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "GitHub Integration",
  description: "Syncs Paperclip issues with GitHub issues. Creates GitHub issues when Paperclip issues are created.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "events.subscribe",
    "issues.read",
    "http.outbound",
    "activity.log.write",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      githubToken: {
        type: "string",
        title: "GitHub Personal Access Token",
        description: "GitHub Personal Access Token for API authentication",
      },
      githubOwner: {
        type: "string",
        title: "GitHub Repository Owner",
        description: "GitHub username or organization that owns the repository",
      },
      githubRepo: {
        type: "string",
        title: "GitHub Repository Name",
        description: "Name of the GitHub repository to sync issues to",
      },
    },
    required: ["githubToken", "githubOwner", "githubRepo"],
  },
};

export default manifest;
