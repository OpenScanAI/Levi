import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { MediaStorage, MediaQueue, MediaCostTracker, type StorageConfig } from "@paperclipai/media-core";
import { ElevenLabsBackend, type ElevenLabsConfig } from "./backends/elevenlabs.js";
import { EdgeTTSBackend, type EdgeTTSConfig } from "./backends/edge-tts.js";
import { registerGenerateAudioTool } from "./tools/generate-audio.js";

const PLUGIN_NAME = "media-audio";

async function getElevenLabsConfig(ctx: PluginContext): Promise<ElevenLabsConfig | null> {
  const config = await ctx.config.get();
  if (!config?.elevenLabsApiKey) return null;
  return {
    apiKey: config.elevenLabsApiKey as string,
    voiceId: (config.elevenLabsVoiceId as string) || "21m00Tcm4TlvDq8ikWAM",
    model: (config.elevenLabsModel as "eleven_multilingual_v2" | "eleven_turbo_v2_5" | "eleven_monolingual_v1") || "eleven_multilingual_v2",
    stability: (config.elevenLabsStability as number) || 0.5,
    similarityBoost: (config.elevenLabsSimilarityBoost as number) || 0.75,
    style: (config.elevenLabsStyle as number) || 0,
    speakerBoost: (config.elevenLabsSpeakerBoost as boolean) || false,
  };
}

async function getEdgeTTSConfig(ctx: PluginContext): Promise<EdgeTTSConfig | null> {
  const config = await ctx.config.get();
  if (!config?.edgeTTSPath) return null;
  return {
    edgeTTSPath: config.edgeTTSPath as string,
    defaultVoice: (config.edgeTTSDefaultVoice as string) || "en-US-AriaNeural",
    defaultRate: (config.edgeTTSDefaultRate as string) || "+0%",
    defaultPitch: (config.edgeTTSDefaultPitch as string) || "+0Hz",
  };
}

async function getStorageConfig(ctx: PluginContext): Promise<StorageConfig> {
  const config = await ctx.config.get();
  return {
    provider: (config?.storageProvider as "local_disk" | "s3") || "local_disk",
    maxAssetAgeDays: (config?.maxAssetAgeDays as number) || 30,
    maxConcurrentJobs: (config?.maxConcurrentJobs as number) || 3,
  };
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    const storageConfig = await getStorageConfig(ctx);
    const storage = new MediaStorage(ctx, storageConfig);
    const queue = new MediaQueue(ctx, storageConfig);
    const costTracker = new MediaCostTracker(ctx);

    // Initialize backends
    const elevenLabsConfig = await getElevenLabsConfig(ctx);
    const elevenLabsBackend = elevenLabsConfig ? new ElevenLabsBackend(ctx, storage, elevenLabsConfig) : null;

    const edgeTTSConfig = await getEdgeTTSConfig(ctx);
    const edgeTTSBackend = edgeTTSConfig ? new EdgeTTSBackend(ctx, storage, edgeTTSConfig) : null;

    // Register tools
    registerGenerateAudioTool(ctx, storage, queue, costTracker, elevenLabsBackend, edgeTTSBackend);

    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`, {
      elevenlabs: elevenLabsBackend ? "enabled" : "disabled",
      edge_tts: edgeTTSBackend ? "enabled" : "disabled",
    });
  },

  async onHealth() {
    return { status: "ok", message: "Media Audio plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
