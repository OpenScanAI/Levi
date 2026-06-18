import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { MediaStorage } from "@paperclipai/media-core";

export function registerSearchImagesTool(ctx: PluginContext, storage: MediaStorage) {
  ctx.tools.register("search_images", {
    displayName: "Search Images",
    description: "Search previously generated images by prompt, date, or agent",
    parametersSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search term to match against image prompts"
        },
        date_from: {
          type: "string",
          description: "Filter images created after this date (ISO 8601)"
        },
        date_to: {
          type: "string",
          description: "Filter images created before this date (ISO 8601)"
        }
      }
    }
  }, async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
    const p = params as {
      query?: string;
      date_from?: string;
      date_to?: string;
    };

    const images = await storage.searchAssets({
      companyId: runCtx.companyId,
      type: "image",
      query: p.query,
      dateFrom: p.date_from,
      dateTo: p.date_to,
    });

    return {
      content: `Found ${images.length} images.`,
      data: {
        count: images.length,
        images: images.map(img => ({
          id: img.id,
          prompt: img.prompt,
          object_key: img.objectKey,
          size: img.byteSize,
          created_at: img.createdAt,
        }))
      }
    };
  });
}
