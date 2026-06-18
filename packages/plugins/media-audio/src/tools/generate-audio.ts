import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { MediaStorage, MediaQueue, MediaCostTracker } from "@paperclipai/media-core";
import type { ElevenLabsBackend } from "../backends/elevenlabs.js";
import type { EdgeTTSBackend } from "../backends/edge-tts.js";
import type { MediaAsset } from "@paperclipai/media-core";

export function registerGenerateAudioTool(
  ctx: PluginContext,
  storage: MediaStorage,
  queue: MediaQueue,
  costTracker: MediaCostTracker,
  elevenLabsBackend: ElevenLabsBackend | null,
  edgeTTSBackend: EdgeTTSBackend | null
) {
  ctx.tools.register("generate_audio", {
    displayName: "Generate Audio",
    description: "Generate audio/TTS from text using ElevenLabs or Edge TTS",
    parametersSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to convert to speech"
        },
        backend: {
          type: "string",
          enum: ["elevenlabs", "edge_tts", "auto"],
          description: "Which backend to use. 'auto' picks based on availability",
          default: "auto"
        },
        voice: {
          type: "string",
          description: "Voice ID to use (ElevenLabs voice ID or Edge TTS voice name)"
        },
        rate: {
          type: "string",
          description: "Speech rate (Edge TTS only, e.g., '+10%%', '-5%%')",
          default: "+0%"
        },
        pitch: {
          type: "string",
          description: "Pitch adjustment (Edge TTS only, e.g., '+5Hz', '-10Hz')",
          default: "+0Hz"
        }
      },
      required: ["text"]
    }
  }, async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
    const p = params as {
      text: string;
      backend?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
    };

    // Validate text
    if (!p.text || typeof p.text !== "string" || p.text.trim().length === 0) {
      throw new Error("text is required and must be a non-empty string");
    }
    if (p.text.length > 5000) {
      throw new Error("text exceeds maximum length of 5000 characters");
    }

    // Validate voice
    if (p.voice !== undefined && (typeof p.voice !== "string" || p.voice.length > 100)) {
      throw new Error("voice must be a string with maximum length of 100 characters");
    }

    // Validate rate (Edge TTS format: +N% or -N%)
    if (p.rate !== undefined && !/^[-+]\d+%$/.test(p.rate)) {
      throw new Error("rate must be in format '+N%' or '-N%' (e.g., '+10%', '-5%')");
    }

    // Validate pitch (Edge TTS format: +NHz or -NHz)
    if (p.pitch !== undefined && !/^[-+]\d+Hz$/.test(p.pitch)) {
      throw new Error("pitch must be in format '+NHz' or '-NHz' (e.g., '+5Hz', '-10Hz')");
    }

    const backend = p.backend === "auto" 
      ? (elevenLabsBackend ? "elevenlabs" : edgeTTSBackend ? "edge_tts" : null)
      : p.backend;

    if (!backend) {
      throw new Error("No audio generation backend available. Configure ElevenLabs or Edge TTS.");
    }

    if (backend === "elevenlabs" && !elevenLabsBackend) {
      throw new Error("ElevenLabs backend not configured");
    }

    if (backend === "edge_tts" && !edgeTTSBackend) {
      throw new Error("Edge TTS backend not configured");
    }

    // Submit to queue
    const job = await queue.submit({
      companyId: runCtx.companyId,
      type: "audio",
      backend: backend as string,
      params: {
        text: p.text,
        voice: p.voice,
        rate: p.rate,
        pitch: p.pitch,
      },
      agentId: runCtx.agentId,
      taskId: runCtx.runId,
    });

    // Process immediately
    await queue.updateStatus(job.id, "running");

    let asset: MediaAsset;
    try {
      if (backend === "elevenlabs" && elevenLabsBackend) {
        asset = await elevenLabsBackend.generate({
          text: p.text,
          voiceId: p.voice,
          companyId: runCtx.companyId,
          agentId: runCtx.agentId,
          taskId: runCtx.runId,
        });
      } else if (backend === "edge_tts" && edgeTTSBackend) {
        asset = await edgeTTSBackend.generate({
          text: p.text,
          voice: p.voice,
          rate: p.rate,
          pitch: p.pitch,
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
        provider: backend === "elevenlabs" ? "elevenlabs" : "edge_tts",
        model: backend === "elevenlabs" ? "eleven_multilingual_v2" : "edge_tts",
        costCents: asset.costCents,
      });

      return {
        content: `Audio generated successfully. Asset ID: ${asset.id}, Object Key: ${asset.objectKey}, Size: ${asset.byteSize} bytes, Cost: ${asset.costCents} cents`,
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
