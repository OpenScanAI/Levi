import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset } from "@paperclipai/media-core";

export interface RunwayConfig {
  apiKey: string;
  model: "gen-3-alpha" | "gen-2";
  defaultDuration: number; // seconds
  defaultWidth: number;
  defaultHeight: number;
}

export class RunwayBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: RunwayConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: RunwayConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    prompt: string;
    image?: Buffer; // Optional: image to animate
    width?: number;
    height?: number;
    duration?: number;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating video with Runway", { prompt: params.prompt, model: this.config.model });

    try {
      // Step 1: Create generation task
      const createResponse = await fetch("https://api.runwayml.com/v1/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: params.prompt,
          ...(params.image ? { image: params.image.toString("base64") } : {}),
          width: params.width || this.config.defaultWidth,
          height: params.height || this.config.defaultHeight,
          duration: params.duration || this.config.defaultDuration,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Runway API error: ${createResponse.status} ${error}`);
      }

      const createResult = await createResponse.json() as { id: string };
      const generationId = createResult.id;

      // Step 2: Poll for completion
      const videoBuffer = await this.pollForResult(generationId, 300000); // 5 min timeout
      const contentType = "video/mp4";

      // Calculate cost (Runway pricing varies by model and duration)
      const costCents = this.calculateCost(params.duration || this.config.defaultDuration);

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.prompt,
        params: {
          backend: "runway",
          model: this.config.model,
          width: params.width || this.config.defaultWidth,
          height: params.height || this.config.defaultHeight,
          duration: params.duration || this.config.defaultDuration,
          generation_id: generationId,
        },
        costCents,
        agentId: params.agentId,
        taskId: params.taskId,
        originalFilename: `${randomUUID()}.mp4`,
      };

      const asset = await this.storage.uploadAsset("video", videoBuffer, contentType, metadata);

      this.ctx.logger.info("Video generated successfully", { assetId: asset.id, size: videoBuffer.length, costCents });

      return asset;
    } catch (error) {
      this.ctx.logger.error("Runway generation failed", { error: String(error) });
      throw error;
    }
  }

  private async pollForResult(generationId: string, timeoutMs: number): Promise<Buffer> {
    const startTime = Date.now();
    const pollInterval = 10000; // 10 seconds

    while (Date.now() - startTime < timeoutMs) {
      const statusResponse = await fetch(`https://api.runwayml.com/v1/generations/${generationId}`, {
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
      });

      if (!statusResponse.ok) {
        throw new Error(`Runway status check failed: ${statusResponse.status}`);
      }

      const status = await statusResponse.json() as { status: string; output?: Array<{ url: string }> };

      if (status.status === "succeeded" && status.output && status.output.length > 0) {
        // Download the video
        const videoUrl = status.output[0].url;
        const videoResponse = await fetch(videoUrl);
        if (videoResponse.ok) {
          const arrayBuffer = await videoResponse.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
        throw new Error("Failed to download generated video from Runway");
      }

      if (status.status === "failed") {
        throw new Error("Runway generation failed");
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Runway generation timed out after ${timeoutMs}ms`);
  }

  private calculateCost(duration: number): number {
    // Runway pricing (as of 2024, in cents)
    // Gen-3 Alpha: ~5¢ per second
    // Gen-2: ~3¢ per second
    const rate = this.config.model === "gen-3-alpha" ? 5 : 3;
    return Math.ceil(duration * rate);
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch("https://api.runwayml.com/v1/health", {
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
      });
      if (response.ok) {
        return { status: "ok", message: "Runway API key valid" };
      }
      return { status: "error", message: `API key invalid: ${response.status}` };
    } catch (error) {
      return { status: "error", message: `Unreachable: ${String(error)}` };
    }
  }
}
