import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset } from "@paperclipai/media-core";

const execFileAsync = promisify(execFile);

export interface FFmpegConfig {
  ffmpegPath: string;
  defaultFps: number;
  defaultDuration: number;
}

export class FFmpegBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: FFmpegConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: FFmpegConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    prompt: string;
    images?: Buffer[]; // Optional: images to animate into video
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating video with FFmpeg", { prompt: params.prompt });

    const tempDir = await mkdtemp(path.join(tmpdir(), "media-video-"));

    try {
      let videoBuffer: Buffer;

      if (params.images && params.images.length > 0) {
        // Image-to-video slideshow
        videoBuffer = await this.createSlideshow(params.images, {
          fps: params.fps || this.config.defaultFps,
          duration: params.duration || this.config.defaultDuration,
          width: params.width || 1024,
          height: params.height || 576,
          tempDir,
        });
      } else {
        // Text-to-video placeholder (color bars with text overlay)
        videoBuffer = await this.createPlaceholderVideo({
          text: params.prompt,
          fps: params.fps || this.config.defaultFps,
          duration: params.duration || this.config.defaultDuration,
          width: params.width || 1024,
          height: params.height || 576,
          tempDir,
        });
      }

      const contentType = "video/mp4";

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.prompt,
        params: {
          backend: "ffmpeg",
          width: params.width || 1024,
          height: params.height || 576,
          fps: params.fps || this.config.defaultFps,
          duration: params.duration || this.config.defaultDuration,
          image_count: params.images?.length || 0,
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
      this.ctx.logger.error("FFmpeg generation failed", { error: String(error) });
      throw error;
    } finally {
      // Cleanup temp directory
      await this.cleanupTempDir(tempDir);
    }
  }

  private async createSlideshow(
    images: Buffer[],
    options: { fps: number; duration: number; width: number; height: number; tempDir: string }
  ): Promise<Buffer> {
    const { fps, duration, width, height, tempDir } = options;
    const frameDuration = duration / images.length;
    const outputPath = path.join(tempDir, "output.mp4");

    // Write images to temp files
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imagePath = path.join(tempDir, `frame_${i.toString().padStart(4, "0")}.png`);
      await writeFile(imagePath, images[i]);
      imagePaths.push(imagePath);
    }

    // Create concat file for FFmpeg
    const concatPath = path.join(tempDir, "concat.txt");
    const concatContent = imagePaths
      .map(p => `file '${p}'\nduration ${frameDuration}`)
      .join("\n");
    await writeFile(concatPath, concatContent);

    // Run FFmpeg
    await execFileAsync(this.config.ffmpegPath, [
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "-r", String(fps),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);

    return await this.readFile(outputPath);
  }

  private async createPlaceholderVideo(
    options: { text: string; fps: number; duration: number; width: number; height: number; tempDir: string }
  ): Promise<Buffer> {
    const { text, fps, duration, width, height, tempDir } = options;
    const outputPath = path.join(tempDir, "output.mp4");

    // Generate color bars with text overlay using FFmpeg
    await execFileAsync(this.config.ffmpegPath, [
      "-f", "lavfi",
      "-i", `color=c=blue:s=${width}x${height}:d=${duration}`,
      "-vf", `drawtext=text='${text.replace(/'/g, "\\'")}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-r", String(fps),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);

    return await this.readFile(outputPath);
  }

  private async readFile(filePath: string): Promise<Buffer> {
    const { readFile } = await import("node:fs/promises");
    return readFile(filePath);
  }

  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      const { rm } = await import("node:fs/promises");
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const { stdout } = await execFileAsync(this.config.ffmpegPath, ["-version"]);
      const version = stdout.split("\n")[0];
      return { status: "ok", message: `FFmpeg available: ${version}` };
    } catch (error) {
      return { status: "error", message: `FFmpeg not available: ${String(error)}` };
    }
  }
}
