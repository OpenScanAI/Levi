import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset } from "@paperclipai/media-core";

export interface DalleConfig {
  apiKey: string;
  model: "dall-e-3" | "dall-e-2";
  quality: "standard" | "hd";
  style: "vivid" | "natural";
  size: "1024x1024" | "1792x1024" | "1024x1792";
}

export class DalleBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: DalleConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: DalleConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    prompt: string;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating image with DALL-E", { prompt: params.prompt, model: this.config.model });

    try {
      // Call OpenAI DALL-E API
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: params.prompt,
          n: 1,
          size: this.config.size,
          quality: this.config.quality,
          style: this.config.style,
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DALL-E API error: ${response.status} ${error}`);
      }

      const result = await response.json() as { data: Array<{ b64_json: string }> };
      
      if (!result.data || result.data.length === 0) {
        throw new Error("No images returned from DALL-E");
      }

      // Decode base64 image
      const imageBuffer = Buffer.from(result.data[0].b64_json, "base64");
      const contentType = "image/png";

      // Calculate cost (DALL-E pricing varies by model and quality)
      const costCents = this.calculateCost();

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.prompt,
        params: {
          backend: "dall-e",
          model: this.config.model,
          size: this.config.size,
          quality: this.config.quality,
          style: this.config.style,
        },
        costCents,
        agentId: params.agentId,
        taskId: params.taskId,
        originalFilename: `${randomUUID()}.png`,
      };

      const asset = await this.storage.uploadAsset("image", imageBuffer, contentType, metadata);

      this.ctx.logger.info("Image generated successfully", { assetId: asset.id, size: imageBuffer.length, costCents });

      return asset;
    } catch (error) {
      this.ctx.logger.error("DALL-E generation failed", { error: String(error) });
      throw error;
    }
  }

  private calculateCost(): number {
    // DALL-E pricing (as of 2024, in cents)
    // DALL-E 3: 1024x1024 = 4¢, 1792x1024/1024x1792 = 8¢, HD = 8¢/16¢
    // DALL-E 2: 1024x1024 = 2¢, 512x512 = 1.8¢, 256x256 = 1.6¢
    if (this.config.model === "dall-e-3") {
      if (this.config.quality === "hd") {
        return this.config.size === "1024x1024" ? 8 : 16;
      }
      return this.config.size === "1024x1024" ? 4 : 8;
    }
    return 2; // DALL-E 2
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
      });
      if (response.ok) {
        return { status: "ok", message: "DALL-E API key valid" };
      }
      return { status: "error", message: `API key invalid: ${response.status}` };
    } catch (error) {
      return { status: "error", message: `Unreachable: ${String(error)}` };
    }
  }
}
