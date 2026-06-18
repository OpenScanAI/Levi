import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { MediaStorage, MediaQueue, MediaCostTracker } from "@paperclipai/media-core";
import type { StableDiffusionBackend } from "../backends/stable-diffusion.js";
import type { DalleBackend } from "../backends/dall-e.js";
import type { MediaAsset } from "@paperclipai/media-core";

export function registerGenerateImageTool(
  ctx: PluginContext,
  storage: MediaStorage,
  queue: MediaQueue,
  costTracker: MediaCostTracker,
  sdBackend: StableDiffusionBackend | null,
  dalleBackend: DalleBackend | null
) {
  ctx.tools.register("generate_image", {
    displayName: "Generate Image",
    description: "Create an image from a text prompt using AI image generation models (Stable Diffusion or DALL-E)",
    parametersSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the image to generate"
        },
        negative_prompt: {
          type: "string",
          description: "Things to avoid in the image (for Stable Diffusion)"
        },
        backend: {
          type: "string",
          enum: ["stable_diffusion", "dall-e", "auto"],
          description: "Which backend to use. 'auto' picks based on availability",
          default: "auto"
        },
        width: {
          type: "number",
          description: "Image width in pixels (Stable Diffusion only)",
          default: 1024
        },
        height: {
          type: "number",
          description: "Image height in pixels (Stable Diffusion only)",
          default: 1024
        },
        steps: {
          type: "number",
          description: "Number of diffusion steps (Stable Diffusion only)",
          default: 30
        }
      },
      required: ["prompt"]
    }
  }, async (params: unknown, runCtx: ToolRunContext) => {
    const p = params as {
      prompt: string;
      negative_prompt?: string;
      backend?: string;
      width?: number;
      height?: number;
      steps?: number;
    };

    // Validate prompt
    if (!p.prompt || typeof p.prompt !== "string" || p.prompt.trim().length === 0) {
      throw new Error("prompt is required and must be a non-empty string");
    }
    if (p.prompt.length > 4000) {
      throw new Error("prompt exceeds maximum length of 4000 characters");
    }

    // Validate dimensions
    if (p.width !== undefined && (p.width < 64 || p.width > 4096)) {
      throw new Error("width must be between 64 and 4096 pixels");
    }
    if (p.height !== undefined && (p.height < 64 || p.height > 4096)) {
      throw new Error("height must be between 64 and 4096 pixels");
    }

    // Validate steps
    if (p.steps !== undefined && (p.steps < 1 || p.steps > 150)) {
      throw new Error("steps must be between 1 and 150");
    }

    const backend = p.backend === "auto" 
      ? (sdBackend ? "stable_diffusion" : dalleBackend ? "dall-e" : null)
      : p.backend;

    if (!backend) {
      throw new Error("No image generation backend available. Configure Stable Diffusion or DALL-E.");
    }

    if (backend === "stable_diffusion" && !sdBackend) {
      throw new Error("Stable Diffusion backend not configured");
    }

    if (backend === "dall-e" && !dalleBackend) {
      throw new Error("DALL-E backend not configured");
    }

    // Submit to queue
    const job = await queue.submit({
      companyId: runCtx.companyId,
      type: "image",
      backend: backend as string,
      params: {
        prompt: p.prompt,
        negativePrompt: p.negative_prompt,
        width: p.width,
        height: p.height,
        steps: p.steps,
      },
      agentId: runCtx.agentId,
      taskId: runCtx.runId,
    });

    // Process immediately (for now — async worker can be added later)
    await queue.updateStatus(job.id, "running");

    let asset: MediaAsset;
    try {
      if (backend === "stable_diffusion" && sdBackend) {
        asset = await sdBackend.generate({
          prompt: p.prompt,
          negativePrompt: p.negative_prompt,
          width: p.width,
          height: p.height,
          steps: p.steps,
          companyId: runCtx.companyId,
          agentId: runCtx.agentId,
          taskId: runCtx.runId,
        });
      } else if (backend === "dall-e" && dalleBackend) {
        asset = await dalleBackend.generate({
          prompt: p.prompt,
          companyId: runCtx.companyId,
          agentId: runCtx.agentId,
          taskId: runCtx.runId,
        });
      } else {
        throw new Error("No valid backend selected");
      }

      await queue.updateStatus(job.id, "succeeded", { assetId: asset.id });

      // Report cost
      await costTracker.reportCost({
        companyId: runCtx.companyId,
        agentId: runCtx.agentId || null,
        taskId: runCtx.runId || null,
        provider: backend === "stable_diffusion" ? "stable_diffusion" : "openai",
        model: backend === "stable_diffusion" ? "sd-xl" : "dall-e-3",
        costCents: asset.costCents,
      });

      return {
        content: `Image generated successfully. Asset ID: ${asset.id}, Object Key: ${asset.objectKey}, Size: ${asset.byteSize} bytes, Cost: ${asset.costCents} cents`,
        data: {
          success: true,
          job_id: job.id,
          asset_id: asset.id,
          object_key: asset.objectKey,
          size: asset.byteSize,
          cost_cents: asset.costCents,
        }
      };
    } catch (error) {
      await queue.updateStatus(job.id, "failed", { error: String(error) });
      throw error;
    }
  });
}
