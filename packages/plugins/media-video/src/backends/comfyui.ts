import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset } from "@paperclipai/media-core";

export interface ComfyUIConfig {
  apiUrl: string;
  workflowTemplate: string; // JSON workflow template name or ID
  timeoutMs: number;
}

export class ComfyUIBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: ComfyUIConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: ComfyUIConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    prompt: string;
    width?: number;
    height?: number;
    frames?: number;
    fps?: number;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating video with ComfyUI", { prompt: params.prompt });

    try {
      // Step 1: Queue the workflow
      const workflow = this.buildWorkflow(params);
      const queueResponse = await fetch(`${this.config.apiUrl}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
      });

      if (!queueResponse.ok) {
        throw new Error(`ComfyUI queue error: ${queueResponse.status} ${queueResponse.statusText}`);
      }

      const queueResult = await queueResponse.json() as { prompt_id: string };
      const promptId = queueResult.prompt_id;

      // Step 2: Poll for completion
      const videoBuffer = await this.pollForResult(promptId, this.config.timeoutMs);
      const contentType = "video/mp4";

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.prompt,
        params: {
          backend: "comfyui",
          width: params.width || 1024,
          height: params.height || 576,
          frames: params.frames || 24,
          fps: params.fps || 6,
          prompt_id: promptId,
        },
        costCents: 0, // Self-hosted = no API cost
        agentId: params.agentId,
        taskId: params.taskId,
        originalFilename: `${randomUUID()}.mp4`,
      };

      const asset = await this.storage.uploadAsset("video", videoBuffer, contentType, metadata);

      this.ctx.logger.info("Video generated successfully", { assetId: asset.id, size: videoBuffer.length });

      return asset;
    } catch (error) {
      this.ctx.logger.error("ComfyUI generation failed", { error: String(error) });
      throw error;
    }
  }

  private buildWorkflow(params: {
    prompt: string;
    width?: number;
    height?: number;
    frames?: number;
    fps?: number;
  }): Record<string, unknown> {
    // Basic ComfyUI workflow for text-to-video
    // In production, this would load from a template file or database
    return {
      "1": {
        inputs: { text: params.prompt, clip: ["4", 1] },
        class_type: "CLIPTextEncode",
      },
      "2": {
        inputs: { width: params.width || 1024, height: params.height || 576, batch_size: params.frames || 24 },
        class_type: "EmptyLatentImage",
      },
      "3": {
        inputs: { samples: ["2", 0], model: ["4", 0], positive: ["1", 0], negative: ["1", 0] },
        class_type: "KSampler",
      },
      "4": {
        inputs: { ckpt_name: "svd_xt_1_1.safetensors" },
        class_type: "CheckpointLoaderSimple",
      },
    };
  }

  private async pollForResult(promptId: string, timeoutMs: number): Promise<Buffer> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      // Check history for completed prompt
      const historyResponse = await fetch(`${this.config.apiUrl}/history/${promptId}`);
      if (historyResponse.ok) {
        const history = await historyResponse.json() as Record<string, { outputs: Record<string, { gifs?: Array<{ filename: string; subfolder: string; type: string }>; videos?: Array<{ filename: string; subfolder: string; type: string }> }> }>;
        const entry = history[promptId];

        if (entry && entry.outputs) {
          for (const nodeId of Object.keys(entry.outputs)) {
            const output = entry.outputs[nodeId];
            const files = output.gifs || output.videos || [];
            if (files.length > 0) {
              // Download the file
              const file = files[0];
              const downloadUrl = `${this.config.apiUrl}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&type=${file.type}`;
              const fileResponse = await fetch(downloadUrl);
              if (fileResponse.ok) {
                const arrayBuffer = await fileResponse.arrayBuffer();
                return Buffer.from(arrayBuffer);
              }
            }
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms`);
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/system_stats`);
      if (response.ok) {
        return { status: "ok", message: "ComfyUI API reachable" };
      }
      return { status: "error", message: `API returned ${response.status}` };
    } catch (error) {
      return { status: "error", message: `Unreachable: ${String(error)}` };
    }
  }
}
