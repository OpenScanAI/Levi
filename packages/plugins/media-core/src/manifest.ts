import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.media-core";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Media Core",
  description: "Shared infrastructure for media generation plugins: storage, queue, cost tracking",
  author: "OpenScanAI",
  categories: ["automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
    "jobs.schedule",
    "http.outbound",
    "metrics.write",
    "telemetry.track",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      storageProvider: {
        type: "string",
        enum: ["local_disk", "s3"],
        default: "local_disk",
        description: "Storage provider for media assets",
      },
      maxAssetAgeDays: {
        type: "number",
        default: 30,
        description: "Auto-cleanup assets older than N days",
      },
      maxConcurrentJobs: {
        type: "number",
        default: 3,
        description: "Max concurrent generation jobs",
      },
    },
  },
  jobs: [
    {
      jobKey: "media-cleanup",
      displayName: "Media Asset Cleanup",
      description: "Remove old media assets based on retention policy",
      schedule: "0 2 * * *",
    },
  ],
};

export default manifest;
