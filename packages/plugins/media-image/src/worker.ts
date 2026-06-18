import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { MediaStorage, MediaQueue, MediaCostTracker, type StorageConfig } from "@paperclipai/media-core";
import { StableDiffusionBackend, type StableDiffusionConfig } from "./backends/stable-diffusion.js";
import { DalleBackend, type DalleConfig } from "./backends/dall-e.js";
import { registerGenerateImageTool } from "./tools/generate-image.js";
import { registerSearchImagesTool } from "./tools/search-images.js";

const PLUGIN_NAME = "media-image";

async function getSdConfig(ctx: PluginContext): Promise<StableDiffusionConfig | null> {
  const config = await ctx.config.get();
  if (!config?.stableDiffusionApiUrl) return null;
  return {
    apiUrl: config.stableDiffusionApiUrl as string,
    model: (config.stableDiffusionModel as string) || "sd-xl",
    width: (config.stableDiffusionWidth as number) || 1024,
    height: (config.stableDiffusionHeight as number) || 1024,
    steps: (config.stableDiffusionSteps as number) || 30,
    cfgScale: (config.stableDiffusionCfgScale as number) || 7,
    sampler: (config.stableDiffusionSampler as string) || "DPM++ 2M Karras",
  };
}

async function getDalleConfig(ctx: PluginContext): Promise<DalleConfig | null> {
  const config = await ctx.config.get();
  if (!config?.dalleApiKey) return null;
  return {
    apiKey: config.dalleApiKey as string,
    model: (config.dalleModel as "dall-e-3" | "dall-e-2") || "dall-e-3",
    quality: (config.dalleQuality as "standard" | "hd") || "standard",
    style: (config.dalleStyle as "vivid" | "natural") || "vivid",
    size: (config.dalleSize as "1024x1024" | "1792x1024" | "1024x1792") || "1024x1024",
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
    const sdConfig = await getSdConfig(ctx);
    const sdBackend = sdConfig ? new StableDiffusionBackend(ctx, storage, sdConfig) : null;

    const dalleConfig = await getDalleConfig(ctx);
    const dalleBackend = dalleConfig ? new DalleBackend(ctx, storage, dalleConfig) : null;

    // Register tools
    registerGenerateImageTool(ctx, storage, queue, costTracker, sdBackend, dalleBackend);
    registerSearchImagesTool(ctx, storage);

    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`, {
      stableDiffusion: sdBackend ? "enabled" : "disabled",
      dalle: dalleBackend ? "enabled" : "disabled",
    });
  },

  async onHealth() {
    return { status: "ok", message: "Media Image plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
