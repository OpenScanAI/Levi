import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.media-dashboard";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Media Dashboard",
  description: "Dashboard UI for media gallery and generation status",
  author: "OpenScanAI",
  categories: ["automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
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
      },
      maxAssetAgeDays: {
        type: "number",
        default: 30,
      },
    },
  },
};

export default manifest;
