import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { MediaStorage, MediaQueue, MediaCostTracker } from "@paperclipai/media-core";
import type { ComfyUIBackend } from "../backends/comfyui.js";
import type { FFmpegBackend } from "../backends/ffmpeg.js";
import type { RunwayBackend } from "../backends/runway.js";
import type { MediaAsset } from "@paperclipai/media-core";

export function registerGenerateVideoTool(
  ctx: PluginContext,
  storage: MediaStorage,
  queue: MediaQueue,
  costTracker: MediaCostTracker,
  comfyBackend: ComfyUIBackend | null,
  ffmpegBackend: FFmpegBackend | null,
  runwayBackend: RunwayBackend | null
) {
  ctx.tools.register("generate_video", {
    displayName: "Generate Video",
    description: "Create a video from a text prompt using AI video generation models (ComfyUI, FFmpeg, or Runway)",
    parametersSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the video to generate"
        },
        backend: {
          type: "string",
          enum: ["comfyui", "ffmpeg", "runway", "auto"],
          description: "Which backend to use. 'auto' picks based on availability",
          default: "auto"
        },
        width: {
          type: "number",
          description: "Video width in pixels",
          default: 1024
        },
        height: {
          type: "number",
          description: "Video height in pixels",
          default: 576
        },
        duration: {
          type: "number",
          description: "Video duration in seconds (Runway/FFmpeg only)",
          default: 5
        },
        fps: {
          type: "number",
          description: "Frames per second (FFmpeg only)",
          default: 6
        },
        frames: {
          type: "number",
          description: "Number of frames (ComfyUI only)",
          default: 24
        }
      },
      required: ["prompt"]
    }
  }, async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
    const p = params as {
      prompt: string;
      backend?: string;
      width?: number;
      height?: number;
      duration?: number;
      fps?: number;
      frames?: number;
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

    // Validate duration
    if (p.duration !== undefined && (p.duration < 1 || p.duration > 60)) {
      throw new Error("duration must be between 1 and 60 seconds");
    }

    // Validate fps
    if (p.fps !== undefined && (p.fps < 1 || p.fps > 60)) {
      throw new Error("fps must be between 1 and 60");
    }

    // Validate frames
    if (p.frames !== undefined && (p.frames < 1 || p.frames > 300)) {
      throw new Error("frames must be between 1 and 300");
    }

    const backend = p.backend === "auto" 
      ? (runwayBackend ? "runway" : comfyBackend ? "comfyui" : ffmpegBackend ? "ffmpeg" : null)
      : p.backend;

    if (!backend) {
      throw new Error("No video generation backend available. Configure ComfyUI, FFmpeg, or Runway.");
    }

    if (backend === "comfyui" && !comfyBackend) {
      throw new Error("ComfyUI backend not configured");
    }

    if (backend === "ffmpeg" && !ffmpegBackend) {
      throw new Error("FFmpeg backend not configured");
    }

    if (backend === "runway" && !runwayBackend) {
      throw new Error("Runway backend not configured");
    }

    // Submit to queue
    const job = await queue.submit({
      companyId: runCtx.companyId,
      type: "video",
      backend: backend as string,
      params: {
        prompt: p.prompt,
        width: p.width,
        height: p.height,
        duration: p.duration,
        fps: p.fps,
        frames: p.frames,
      },
      agentId: runCtx.agentId,
      taskId: runCtx.runId,
    });

    // Process immediately (for now — async worker can be added later)
    await queue.updateStatus(job.id, "running");

    let asset: MediaAsset;
    try {
      if (backend === "comfyui" && comfyBackend) {
        asset = await comfyBackend.generate({
          prompt: p.prompt,
          width: p.width,
          height: p.height,
          frames: p.frames,
          companyId: runCtx.companyId,
          agentId: runCtx.agentId,
          taskId: runCtx.runId,
        });
      } else if (backend === "ffmpeg" && ffmpegBackend) {
        asset = await ffmpegBackend.generate({
          prompt: p.prompt,
          width: p.width,
          height: p.height,
          fps: p.fps,
          duration: p.duration,
          companyId: runCtx.companyId,
          agentId: runCtx.agentId,
          taskId: runCtx.runId,
        });
      } else if (backend === "runway" && runwayBackend) {
        asset = await runwayBackend.generate({
          prompt: p.prompt,
          width: p.width,
          height: p.height,
          duration: p.duration,
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
        provider: backend === "comfyui" ? "comfyui" : backend === "ffmpeg" ? "ffmpeg" : "runway",
        model: backend === "comfyui" ? "svd" : backend === "ffmpeg" ? "placeholder" : "gen-3",
        costCents: asset.costCents,
      });

      return {
        content: `Video generated successfully. Asset ID: ${asset.id}, Object Key: ${asset.objectKey}, Size: ${asset.byteSize} bytes, Cost: ${asset.costCents} cents`,
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
