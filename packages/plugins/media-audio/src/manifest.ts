import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.media-audio";
const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Media Audio",
  description: "Audio/TTS generation plugin — ElevenLabs, Edge TTS",
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
      elevenLabsApiKey: {
        type: "string",
        description: "ElevenLabs API key",
      },
      elevenLabsVoiceId: {
        type: "string",
        default: "21m00Tcm4TlvDq8ikWAM",
        description: "Default ElevenLabs voice ID",
      },
      elevenLabsModel: {
        type: "string",
        enum: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"],
        default: "eleven_multilingual_v2",
        description: "ElevenLabs model",
      },
      edgeTTSPath: {
        type: "string",
        default: "edge-tts",
        description: "Path to edge-tts binary",
      },
      edgeTTSDefaultVoice: {
        type: "string",
        default: "en-US-AriaNeural",
        description: "Default Edge TTS voice",
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
      name: "generate_audio",
      displayName: "Generate Audio",
      description: "Generate audio/TTS from text using ElevenLabs or Edge TTS",
      parametersSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          backend: { type: "string" },
          voice: { type: "string" },
          rate: { type: "string" },
          pitch: { type: "string" },
        },
        required: ["text"],
      },
    },
  ],
};

export default manifest;
