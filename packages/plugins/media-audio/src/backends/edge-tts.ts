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

export interface EdgeTTSConfig {
  edgeTTSPath: string;
  defaultVoice: string;
  defaultRate: string;
  defaultPitch: string;
}

export class EdgeTTSBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: EdgeTTSConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: EdgeTTSConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    text: string;
    voice?: string;
    rate?: string;
    pitch?: string;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating audio with Edge TTS", { textLength: params.text.length, voice: params.voice || this.config.defaultVoice });

    const tempDir = await mkdtemp(path.join(tmpdir(), "media-audio-"));
    const outputPath = path.join(tempDir, "output.mp3");

    try {
      // Write text to temp file
      const textPath = path.join(tempDir, "input.txt");
      await writeFile(textPath, params.text);

      // Run edge-tts command
      const args = [
        "--file", textPath,
        "--write-media", outputPath,
        "--voice", params.voice || this.config.defaultVoice,
        "--rate", params.rate || this.config.defaultRate,
        "--pitch", params.pitch || this.config.defaultPitch,
      ];

      await execFileAsync(this.config.edgeTTSPath, args);

      // Read the generated audio
      const { readFile } = await import("node:fs/promises");
      const audioBuffer = await readFile(outputPath);
      const contentType = "audio/mpeg";

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.text,
        params: {
          backend: "edge_tts",
          voice: params.voice || this.config.defaultVoice,
          rate: params.rate || this.config.defaultRate,
          pitch: params.pitch || this.config.defaultPitch,
          text_length: params.text.length,
        },
        costCents: 0, // Free — uses system TTS
        agentId: params.agentId,
        taskId: params.taskId,
        originalFilename: `${randomUUID()}.mp3`,
      };

      const asset = await this.storage.uploadAsset("audio", audioBuffer, contentType, metadata);

      this.ctx.logger.info("Audio generated successfully", { assetId: asset.id, size: audioBuffer.length });

      return asset;
    } catch (error) {
      this.ctx.logger.error("Edge TTS generation failed", { error: String(error) });
      throw error;
    } finally {
      // Cleanup temp directory
      await this.cleanupTempDir(tempDir);
    }
  }

  async getVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    try {
      const { stdout } = await execFileAsync(this.config.edgeTTSPath, ["--list-voices"]);
      // Parse edge-tts voice list output
      const voices: Array<{ id: string; name: string; language: string }> = [];
      const lines = stdout.split("\n");
      for (const line of lines) {
        const match = line.match(/^(\S+)\s+(.+?)\s+(.+)$/);
        if (match) {
          voices.push({ id: match[1], name: match[2], language: match[3] });
        }
      }
      return voices;
    } catch (error) {
      this.ctx.logger.error("Failed to fetch Edge TTS voices", { error: String(error) });
      return [];
    }
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
      const { stdout } = await execFileAsync(this.config.edgeTTSPath, ["--version"]);
      return { status: "ok", message: `Edge TTS available: ${stdout.trim()}` };
    } catch (error) {
      return { status: "error", message: `Edge TTS not available: ${String(error)}` };
    }
  }
}
