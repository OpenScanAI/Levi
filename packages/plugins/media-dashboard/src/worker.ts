import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { MediaStorage, MediaQueue, type StorageConfig } from "@paperclipai/media-core";

const PLUGIN_NAME = "media-dashboard";

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

    // Register UI slots (if ui API is available)
    if ((ctx as any).ui) {
      (ctx as any).ui.register({
        slots: [
          {
            type: "dashboardWidget",
            name: "media-gallery",
            displayName: "Media Gallery",
            description: "Browse and search generated media assets",
          },
          {
            type: "dashboardWidget",
            name: "generation-status",
            displayName: "Generation Status",
            description: "Monitor active and recent media generation jobs",
          },
        ],
      });
    }

    // Register API routes for UI data fetching (if api API is available)
    if ((ctx as any).api) {
      (ctx as any).api.register({
        method: "GET",
        path: "/media/assets",
        handler: async (req: any) => {
          const companyId = req.query.company_id as string;
          const type = req.query.type as string;
          const query = req.query.query as string;
          
          const assets = await storage.searchAssets({
            companyId,
            type: type as any,
            query,
          });
          
          return { status: 200, body: { assets } };
        },
      });

      (ctx as any).api.register({
        method: "GET",
        path: "/media/jobs",
        handler: async (req: any) => {
          const companyId = req.query.company_id as string;
          const jobs = await queue.getQueue(companyId);
          return { status: 200, body: { jobs } };
        },
      });
    }

    ctx.logger.info(`${PLUGIN_NAME} plugin setup complete`);
  },

  async onHealth() {
    return { status: "ok", message: "Media Dashboard plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
