# Media Generation Plugin Suite — Integration Guide

**Issue:** https://github.com/OpenScanAI/Levi/issues/20  
**Branch:** `issue-20-media-suite`  
**Status:** Ready for integration testing

---

## Plugin Overview

The Media Generation Plugin Suite adds AI-powered media creation capabilities to Levi/Paperclip:

| Plugin | Purpose | Tools | Backends |
|--------|---------|-------|----------|
| `media-core` | Shared infrastructure | — | Storage, Queue, Cost |
| `media-image` | Image generation | `generate_image`, `search_images` | Stable Diffusion, DALL-E |
| `media-video` | Video generation | `generate_video` | ComfyUI, FFmpeg, Runway |
| `media-audio` | Audio/TTS generation | `generate_audio` | ElevenLabs, Edge TTS |
| `media-dashboard` | UI gallery & status | — | GalleryWidget, GenerationStatus |

---

## Installation

### 1. Build all packages

```bash
cd /Users/omkandpal/Levi
pnpm --filter @paperclipai/media-* build
```

### 2. Install plugins in Levi

Install via the Levi API or CLI:

```bash
# Install media-core first (required by others)
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/Users/omkandpal/Levi/packages/plugins/media-core", "isLocalPath": true}'

# Install media-image
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/Users/omkandpal/Levi/packages/plugins/media-image", "isLocalPath": true}'

# Install media-video
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/Users/omkandpal/Levi/packages/plugins/media-video", "isLocalPath": true}'

# Install media-audio
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/Users/omkandpal/Levi/packages/plugins/media-audio", "isLocalPath": true}'

# Install media-dashboard (optional UI)
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/Users/omkandpal/Levi/packages/plugins/media-dashboard", "isLocalPath": true}'
```

---

## Configuration

Each plugin reads configuration from Levi's plugin config system. Set these via the Levi UI or API:

### media-core

| Config Key | Default | Description |
|------------|---------|-------------|
| `storageProvider` | `local_disk` | Storage backend: `local_disk` or `s3` |
| `maxAssetAgeDays` | `30` | Auto-cleanup age for old assets |
| `maxConcurrentJobs` | `3` | Max parallel generation jobs |

### media-image

| Config Key | Required | Description |
|------------|----------|-------------|
| `stableDiffusionApiUrl` | No | URL of Stable Diffusion API (e.g., `http://localhost:7860`) |
| `stableDiffusionModel` | No | Model name (default: `sd-xl`) |
| `dalleApiKey` | No | OpenAI API key for DALL-E |
| `dalleModel` | No | `dall-e-3` or `dall-e-2` (default: `dall-e-3`) |
| `dalleQuality` | No | `standard` or `hd` (default: `standard`) |
| `dalleStyle` | No | `vivid` or `natural` (default: `vivid`) |
| `dalleSize` | No | `1024x1024`, `1792x1024`, `1024x1792` |

### media-video

| Config Key | Required | Description |
|------------|----------|-------------|
| `comfyuiApiUrl` | No | URL of ComfyUI API (e.g., `http://localhost:8188`) |
| `comfyuiTimeoutMs` | No | Generation timeout (default: `300000`) |
| `ffmpegPath` | No | Path to FFmpeg binary (default: `ffmpeg`) |
| `runwayApiKey` | No | Runway ML API key |
| `runwayModel` | No | `gen-3-alpha` or `gen-2` (default: `gen-3-alpha`) |

### media-audio

| Config Key | Required | Description |
|------------|----------|-------------|
| `elevenLabsApiKey` | No | ElevenLabs API key |
| `elevenLabsVoiceId` | No | Default voice ID (default: `21m00Tcm4TlvDq8ikWAM`) |
| `elevenLabsModel` | No | `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1` |
| `edgeTTSPath` | No | Path to `edge-tts` binary (default: `edge-tts`) |
| `edgeTTSDefaultVoice` | No | Default voice (default: `en-US-AriaNeural`) |

---

## Usage Examples

### Generate an image

```json
{
  "tool": "generate_image",
  "params": {
    "prompt": "A futuristic cityscape at sunset, cyberpunk style, neon lights",
    "backend": "auto",
    "width": 1024,
    "height": 1024
  }
}
```

### Generate a video

```json
{
  "tool": "generate_video",
  "params": {
    "prompt": "A serene mountain landscape with flowing clouds, timelapse",
    "backend": "auto",
    "duration": 5,
    "width": 1024,
    "height": 576
  }
}
```

### Generate audio/TTS

```json
{
  "tool": "generate_audio",
  "params": {
    "text": "Welcome to the future of AI-powered content creation.",
    "backend": "auto",
    "voice": "en-US-AriaNeural"
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Levi / Paperclip                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Agent     │  │   Agent     │  │   Agent     │  │
│  │   Tools     │  │   Tools     │  │   Tools     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
│  ┌──────┴────────────────┴────────────────┴──────┐  │
│  │              Plugin SDK Layer                  │  │
│  │         (ctx.tools, ctx.state, etc.)           │  │
│  └──────┬────────────────┬────────────────┬──────┘  │
│         │                │                │          │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐  │
│  │ media-image │  │ media-video │  │ media-audio │  │
│  │             │  │             │  │             │  │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │
│  │ │ Stable  │ │  │ │ ComfyUI │ │  │ │ElevenLab│ │  │
│  │ │  Diff   │ │  │ │         │ │  │ │   s     │ │  │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │
│  │ │ DALL-E  │ │  │ │ FFmpeg  │ │  │ │ EdgeTTS │ │  │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │
│  │             │  │ ┌─────────┐ │  │             │  │
│  │             │  │ │ Runway  │ │  │             │  │
│  │             │  │ └─────────┘ │  │             │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
│  ┌──────┴────────────────┴────────────────┴──────┐  │
│  │              media-core (shared)               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │  │ Storage │  │  Queue  │  │  Cost   │      │  │
│  │  │ Wrapper │  │         │  │ Tracker │      │  │
│  │  └─────────┘  └─────────┘  └─────────┘      │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │           media-dashboard (UI)               │  │
│  │     GalleryWidget + GenerationStatus         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Testing

### Build verification

```bash
# Build all media packages
pnpm --filter @paperclipai/media-* build

# Typecheck all
pnpm --filter @paperclipai/media-* typecheck
```

### Manual testing checklist

- [ ] Install `media-core` plugin — no errors
- [ ] Install `media-image` plugin — no errors
- [ ] Call `generate_image` with DALL-E backend — image generated, cost tracked
- [ ] Call `generate_image` with Stable Diffusion backend — image generated
- [ ] Install `media-video` plugin — no errors
- [ ] Call `generate_video` with FFmpeg backend — video generated
- [ ] Install `media-audio` plugin — no errors
- [ ] Call `generate_audio` with Edge TTS backend — audio generated
- [ ] Call `generate_audio` with ElevenLabs backend — audio generated, cost tracked
- [ ] Install `media-dashboard` plugin — no errors
- [ ] Verify gallery widget renders (if UI supported)
- [ ] Verify generation status shows jobs

---

## Known Limitations

1. **Plugin state storage** — Asset metadata stored in plugin state (key-value). No SQL querying support. Search is stubbed and returns empty results.

2. **No binary file storage** — Actual media files (images, videos, audio) are not stored in Levi's storage system yet. Only metadata is tracked. Binary storage requires integration with Levi's `StorageService` API.

3. **Async job processing** — Jobs are processed synchronously in the tool handler. True async background processing would require a worker pool or job queue system.

4. **UI components static** — React components are defined but not dynamically rendered. Levi's UI slot system needs host support for plugin-contributed widgets.

5. **Cost aggregation** — Total cost per company/agent is not aggregated. Plugin state doesn't support aggregation queries.

6. **Cleanup stubbed** — Asset cleanup job exists but doesn't actually delete old assets (no date-based querying in plugin state).

---

## Future Enhancements

- **Database integration** — Replace plugin state with proper PostgreSQL tables for assets, jobs, costs
- **Binary storage** — Integrate with Levi's `StorageService` for actual file upload/download
- **Async workers** — Background job processing with progress updates via SSE
- **Real-time UI** — Live dashboard updates via WebSocket/SSE
- **More backends** — Add Midjourney, Pika, Kling, Suno, etc.
- **Batch generation** — Generate multiple images/videos in one call
- **Style presets** — Pre-defined prompt templates for consistent branding
- **Asset editing** — Inpainting, outpainting, video editing tools

---

## Files Added

```
packages/plugins/
├── media-core/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── storage.ts
│   │   ├── queue.ts
│   │   ├── cost.ts
│   │   ├── worker.ts
│   │   └── manifest.ts
├── media-image/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── backends/
│   │   │   ├── stable-diffusion.ts
│   │   │   └── dall-e.ts
│   │   ├── tools/
│   │   │   ├── generate-image.ts
│   │   │   └── search-images.ts
│   │   └── worker.ts
├── media-video/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── backends/
│   │   │   ├── comfyui.ts
│   │   │   ├── ffmpeg.ts
│   │   │   └── runway.ts
│   │   ├── tools/
│   │   │   └── generate-video.ts
│   │   └── worker.ts
├── media-audio/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── backends/
│   │   │   ├── elevenlabs.ts
│   │   │   └── edge-tts.ts
│   │   ├── tools/
│   │   │   └── generate-audio.ts
│   │   └── worker.ts
└── media-dashboard/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── ui/
    │   │   ├── GalleryWidget.tsx
    │   │   ├── GenerationStatus.tsx
    │   │   └── index.ts
    │   └── worker.ts

doc/plans/
└── 2026-06-18-media-generation-plugin-suite.md

pnpm-workspace.yaml (updated)
```

---

**Integration complete. Ready for testing and PR creation.**
