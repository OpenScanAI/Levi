import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { MediaStorage, MediaQueue, MediaCostTracker, type StorageConfig } from "@paperclipai/media-core";
import { ComfyUIBackend, type ComfyUIConfig } from "./backends/comfyui.js";
import { FFmpegBackend, type FFmpegConfig } from "./backends/ffmpeg.js";
import { RunwayBackend, type RunwayConfig } from "./backends/runway.js";
import { registerGenerateVideoTool } from "./tools/generate-video.js";

const PLUGIN_NAME = "media-video";

async function getComfyConfig(ctx: PluginContext): Promise<ComfyUIConfig | null> {
  const config = await ctx.config.get();
  if (!config?.comfyuiApiUrl) return null;
  return {
    apiUrl: config.comfyuiApiUrl as string,
    workflowTemplate: (config.comfyuiWorkflowTemplate as string) || "default",
    timeoutMs: (config.comfyuiTimeoutMs as number) || 300000,
  };
}

async function getFFmpegConfig(ctx: PluginContext): Promise<FFmpegConfig | null> {
  const config = await ctx.config.get();
  if (!config?.ffmpegPath) return null;
  return {
    ffmpegPath: config.ffmpegPath as string,
    defaultFps: (config.ffmpegDefaultFps as number) || 6,
    defaultDuration: (config.ffmpegDefaultDuration as number) || 5,
  };
}

async function getRunwayConfig(ctx: PluginContext): Promise<RunwayConfig | null> {
  const config = await ctx.config.get();
  if (!config?.runwayApiKey) return null;
  return {
    apiKey: config.runwayApiKey as string,
    model: (config.runwayModel as "gen-3-alpha" | "gen-2") || "gen-3-alpha",
    defaultDuration: (config.runwayDefaultDuration as number) || 5,
    defaultWidth: (config.runwayDefaultWidth as number) || 1024,
    defaultHeight: (config.runwayDefaultHeight as number) || 576,
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
    const comfyConfig = await getComfyConfig(ctx);
    const comfyBackend = comfyConfig ? new ComfyUIBackend(ctx, storage, comfyConfig) : null;

    const ffmpegConfig = await getFFmpegConfig(ctx);
    const ffmpegBackend = ffmpegConfig ? new FFmpegBackend(ctx, storage, ffmpegConfig) : null;

    const runwayConfig = await getRunwayConfig(ctx);
    const runwayBackend = runwayConfig ? new RunwayBackend(ctx, storage, runwayConfig) : null;

    // Register tools
    registerGenerateVideoTool(ctx, storage, queue, costTracker, comfyBackend, ffmpegBackend, runwayBackend);

    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`, {
      comfyui: comfyBackend ? "enabled" : "disabled",
      ffmpeg: ffmpegBackend ? "enabled" : "disabled",
      runway: runwayBackend ? "enabled" : "disabled",
    });
  },

  async onHealth() {
    return { status: "ok", message: "Media Video plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
