import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.media-image";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Media Image",
  description: "Image generation plugin — Stable Diffusion, DALL-E",
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
      stableDiffusionApiUrl: {
        type: "string",
        description: "URL of Stable Diffusion API (e.g., http://localhost:7860)",
      },
      stableDiffusionModel: {
        type: "string",
        default: "sd-xl",
        description: "Stable Diffusion model name",
      },
      dalleApiKey: {
        type: "string",
        description: "OpenAI API key for DALL-E",
      },
      dalleModel: {
        type: "string",
        enum: ["dall-e-3", "dall-e-2"],
        default: "dall-e-3",
        description: "DALL-E model version",
      },
      dalleQuality: {
        type: "string",
        enum: ["standard", "hd"],
        default: "standard",
        description: "DALL-E image quality",
      },
      dalleStyle: {
        type: "string",
        enum: ["vivid", "natural"],
        default: "vivid",
        description: "DALL-E image style",
      },
      dalleSize: {
        type: "string",
        enum: ["1024x1024", "1792x1024", "1024x1792"],
        default: "1024x1024",
        description: "DALL-E image size",
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
      name: "generate_image",
      displayName: "Generate Image",
      description: "Generate an image from a text prompt using Stable Diffusion or DALL-E",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          backend: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "search_images",
      displayName: "Search Images",
      description: "Search previously generated images by prompt or metadata",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    },
  ],
};

export default manifest;
