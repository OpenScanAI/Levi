import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaStorage, UploadMetadata } from "@paperclipai/media-core";
import type { MediaAsset } from "@paperclipai/media-core";

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  model: "eleven_multilingual_v2" | "eleven_turbo_v2_5" | "eleven_monolingual_v1";
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
}

export class ElevenLabsBackend {
  private ctx: PluginContext;
  private storage: MediaStorage;
  private config: ElevenLabsConfig;

  constructor(ctx: PluginContext, storage: MediaStorage, config: ElevenLabsConfig) {
    this.ctx = ctx;
    this.storage = storage;
    this.config = config;
  }

  async generate(params: {
    text: string;
    voiceId?: string;
    companyId: string;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaAsset> {
    this.ctx.logger.info("Generating audio with ElevenLabs", { textLength: params.text.length, voice: params.voiceId || this.config.voiceId });

    try {
      // Call ElevenLabs API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId || this.config.voiceId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.text,
          model_id: this.config.model,
          voice_settings: {
            stability: this.config.stability,
            similarity_boost: this.config.similarityBoost,
            style: this.config.style,
            use_speaker_boost: this.config.speakerBoost,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${error}`);
      }

      // ElevenLabs returns audio bytes directly
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      const contentType = "audio/mpeg";

      // Calculate cost (ElevenLabs pricing: ~1¢ per 1000 characters for standard voices)
      const costCents = this.calculateCost(params.text.length);

      // Store the asset
      const metadata: UploadMetadata = {
        companyId: params.companyId,
        prompt: params.text,
        params: {
          backend: "elevenlabs",
          voice_id: params.voiceId || this.config.voiceId,
          model: this.config.model,
          text_length: params.text.length,
          stability: this.config.stability,
          similarity_boost: this.config.similarityBoost,
        },
        costCents,
        agentId: params.agentId,
        taskId: params.taskId,
        originalFilename: `${randomUUID()}.mp3`,
      };

      const asset = await this.storage.uploadAsset("audio", audioBuffer, contentType, metadata);

      this.ctx.logger.info("Audio generated successfully", { assetId: asset.id, size: audioBuffer.length, costCents });

      return asset;
    } catch (error) {
      this.ctx.logger.error("ElevenLabs generation failed", { error: String(error) });
      throw error;
    }
  }

  private calculateCost(textLength: number): number {
    // ElevenLabs pricing (as of 2024, in cents)
    // Standard voices: ~1¢ per 1000 characters
    // Turbo voices: ~0.5¢ per 1000 characters
    const rate = this.config.model.includes("turbo") ? 0.5 : 1.0;
    return Math.ceil((textLength / 1000) * rate);
  }

  async getVoices(): Promise<Array<{ id: string; name: string; preview_url?: string }>> {
    try {
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs voices API error: ${response.status}`);
      }

      const result = await response.json() as { voices: Array<{ voice_id: string; name: string; preview_url?: string }> };
      return result.voices.map(v => ({ id: v.voice_id, name: v.name, preview_url: v.preview_url }));
    } catch (error) {
      this.ctx.logger.error("Failed to fetch ElevenLabs voices", { error: String(error) });
      return [];
    }
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
      });
      if (response.ok) {
        return { status: "ok", message: "ElevenLabs API key valid" };
      }
      return { status: "error", message: `API key invalid: ${response.status}` };
    } catch (error) {
      return { status: "error", message: `Unreachable: ${String(error)}` };
    }
  }
}
