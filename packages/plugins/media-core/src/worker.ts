import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, PluginJobContext } from "@paperclipai/plugin-sdk";
import { MediaStorage } from "./storage.js";
import { MediaQueue } from "./queue.js";
import { MediaCostTracker } from "./cost.js";
import type { StorageConfig } from "./types.js";

const PLUGIN_NAME = "media-core";

async function getConfig(ctx: PluginContext): Promise<StorageConfig> {
  const config = await ctx.config.get();
  return {
    provider: (config?.storageProvider as "local_disk" | "s3") || "local_disk",
    maxAssetAgeDays: (config?.maxAssetAgeDays as number) || 30,
    maxConcurrentJobs: (config?.maxConcurrentJobs as number) || 3,
  };
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    const config = await getConfig(ctx);
    const storage = new MediaStorage(ctx, config);
    const queue = new MediaQueue(ctx, config);
    const costTracker = new MediaCostTracker(ctx);

    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`, { ...config });

    // Register cleanup job handler
    ctx.jobs.register("media-cleanup", async (job: PluginJobContext) => {
      ctx.logger.info("Running media asset cleanup", { runId: job.runId });
      const deleted = await storage.cleanupOldAssets();
      ctx.logger.info("Media cleanup complete", { deleted });
    });

    // Store references for other modules to access
    // Note: In a real implementation, we'd expose these via a proper API
    // For now, we log that the infrastructure is ready
    ctx.logger.info("Media infrastructure ready", {
      storage: "initialized",
      queue: "initialized",
      costTracker: "initialized",
    });
  },

  async onHealth() {
    return { status: "ok", message: "Media Core plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
