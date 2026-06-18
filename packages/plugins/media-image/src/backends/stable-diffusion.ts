import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset, MediaJob } from "@paperclipai/media-core";
import { withRetry, defaultRetryConfig } from "@paperclipai/media-core";

export interface StableDiffusionConfig {
  apiUrl: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
}

export class StableDiffusionBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: StableDiffusionConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: StableDiffusionConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating image with Stable Diffusion", { prompt: params.prompt });

    return withRetry(async () => {
      // Build the payload for Stable Diffusion API (AUTOMATIC1111 or ComfyUI compatible)
      const payload = {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt || "",
        width: params.width || this.config.width,
        height: params.height || this.config.height,
        steps: params.steps || this.config.steps,
        cfg_scale: this.config.cfgScale,
        sampler_index: this.config.sampler,
        seed: -1,
        batch_size: 1,
        n_iter: 1,
      };

      try {
        // Call Stable Diffusion API
        const response = await fetch(`${this.config.apiUrl}/sdapi/v1/txt2img`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Stable Diffusion API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json() as { images: string[] };
        
        if (!result.images || result.images.length === 0) {
          throw new Error("No images returned from Stable Diffusion");
        }

        // Decode base64 image
        const imageBuffer = Buffer.from(result.images[0], "base64");
        const contentType = "image/png";

        // Store the asset
        const metadata: UploadMetadata = {
          companyId: params.companyId,
          prompt: params.prompt,
          params: {
            backend: "stable_diffusion",
            model: this.config.model,
            width: payload.width,
            height: payload.height,
            steps: payload.steps,
            cfg_scale: payload.cfg_scale,
            sampler: payload.sampler_index,
          },
          costCents: 0, // Self-hosted = no API cost
          agentId: params.agentId,
          taskId: params.taskId,
          originalFilename: `${randomUUID()}.png`,
        };

        const asset = await this.storage.uploadAsset("image", imageBuffer, contentType, metadata);

        this.ctx.logger.info("Image generated successfully", { assetId: asset.id, size: imageBuffer.length });

        return asset;
      } catch (error) {
        this.ctx.logger.error("Stable Diffusion generation failed", { error: String(error) });
        throw error;
      }
    }, "Stable Diffusion image generation", defaultRetryConfig, this.ctx.logger);
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/sdapi/v1/samplers`, { method: "GET" });
      if (response.ok) {
        return { status: "ok", message: "Stable Diffusion API reachable" };
      }
      return { status: "error", message: `API returned ${response.status}` };
    } catch (error) {
      return { status: "error", message: `Unreachable: ${String(error)}` };
    }
  }
}
