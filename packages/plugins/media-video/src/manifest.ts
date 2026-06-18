import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.media-video";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Media Video",
  description: "Video generation plugin — ComfyUI, FFmpeg, Runway",
  author: "OpenScanAI",
  categories: ["automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
    "http.outbound",
    "metrics.write",
    "telemetry.track",
    "activity.log.write",
    "secrets.read-ref",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      comfyuiApiUrl: {
        type: "string",
        description: "URL of ComfyUI API (e.g., http://localhost:8188)",
      },
      comfyuiTimeoutMs: {
        type: "number",
        default: 300000,
        description: "ComfyUI generation timeout in ms",
      },
      ffmpegPath: {
        type: "string",
        default: "ffmpeg",
        description: "Path to FFmpeg binary",
      },
      runwayApiKey: {
        type: "string",
        description: "Runway ML API key",
      },
      runwayModel: {
        type: "string",
        enum: ["gen-3-alpha", "gen-2"],
        default: "gen-3-alpha",
        description: "Runway model version",
      },
      storageProvider: {
        type: "string",
        enum: ["local_disk", "s3"],
        default: "local_disk",
      },
      maxAssetAgeDays: {
        type: "number",
        default: 30,
      },
      maxConcurrentJobs: {
        type: "number",
        default: 3,
      },
    },
  },
  tools: [
    {
      name: "generate_video",
      displayName: "Generate Video",
      description: "Generate a video from a text prompt using ComfyUI, FFmpeg, or Runway",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          backend: { type: "string" },
          duration: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
        required: ["prompt"],
      },
    },
  ],
};

export default manifest;
