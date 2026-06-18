# Media Generation Plugin Suite — Implementation Plan

**Issue:** https://github.com/OpenScanAI/Levi/issues/20  
**Repo:** OpenScanAI/Levi (fork of paperclipai/paperclip)  
**Branch:** `issue-20-media-suite`  
**Estimated Duration:** 6 weeks for MVP

---

## Phase 1: media-core Framework (Week 1)

**Goal:** Shared infrastructure that all media plugins use.

**What to build:**
- `packages/plugins/media-core/` — new plugin package
- Asset storage wrapper around Levi's storage provider (`local_disk` / S3)
- Generation job queue with retry logic
- Cost tracking integration with Levi's `cost_events` system
- Agent tool registration helpers

**Key files:**
```
packages/plugins/media-core/
├── src/
│   ├── index.ts              # Public API exports
│   ├── storage.ts            # Asset upload/download/search
│   ├── queue.ts              # Job queue with backpressure
│   ├── cost.ts               # Cost reporting to Levi
│   └── types.ts              # Shared interfaces
├── src/manifest.ts           # Plugin manifest
├── src/worker.ts             # Worker entry
├── package.json
└── tsconfig.json
```

**Acceptance criteria:**
- [ ] `media-core` installs without errors
- [ ] Can store/retrieve assets with metadata
- [ ] Can queue jobs and track status
- [ ] Cost events report to Levi budget system
- [ ] Typecheck passes

---

## Phase 2: media-image Plugin (Week 2)

**Goal:** First working media plugin — image generation.

**What to build:**
- `packages/plugins/media-image/` — image generation plugin
- Stable Diffusion backend (self-hosted via Docker/ComfyUI)
- DALL-E 3 backend (OpenAI API)
- Agent tools: `generate_image`, `search_images`
- Store generated images with metadata (prompt, params, cost)

**Key files:**
```
packages/plugins/media-image/
├── src/
│   ├── worker.ts             # Tool registration + job handler
│   ├── backends/
│   │   ├── stable-diffusion.ts
│   │   └── dall-e.ts
│   ├── tools/
│   │   ├── generate-image.ts
│   │   └── search-images.ts
│   └── manifest.ts
├── package.json
└── tsconfig.json
```

**Agent tool example:**
```typescript
ctx.tools.register("generate_image", {
  displayName: "Generate Image",
  description: "Create image from text prompt",
  parametersSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      width: { type: "number", default: 1024 },
      height: { type: "number", default: 1024 },
      style: { type: "string", enum: ["realistic", "animated", "3d"], default: "realistic" },
      format: { type: "string", enum: ["png", "jpg", "webp"], default: "png" }
    },
    required: ["prompt"]
  }
}, async (params) => { ... });
```

**Acceptance criteria:**
- [ ] Agent can call `generate_image` and get back a job ID
- [ ] Image generates via Stable Diffusion backend
- [ ] Generated image stored in Levi storage with metadata
- [ ] Cost tracked in Levi cost system
- [ ] Agent can search previously generated images

---

## Phase 3: media-video Plugin (Week 3-4)

**Goal:** Video generation with multiple backends.

**What to build:**
- `packages/plugins/media-video/` — video generation plugin
- ComfyUI backend (for advanced video workflows)
- FFmpeg backend (for simple image-to-video, GIF generation)
- Runway ML backend (API-based, high quality)
- Agent tools: `generate_video`, `search_videos`

**Key files:**
```
packages/plugins/media-video/
├── src/
│   ├── worker.ts
│   ├── backends/
│   │   ├── comfyui.ts
│   │   ├── ffmpeg.ts
│   │   └── runway.ts
│   ├── tools/
│   │   ├── generate-video.ts
│   │   └── search-videos.ts
│   └── manifest.ts
```

**Acceptance criteria:**
- [ ] Agent can generate video from text prompt
- [ ] Multiple backends work (ComfyUI, FFmpeg, Runway)
- [ ] Videos stored with metadata
- [ ] Progress tracking during generation
- [ ] Cost tracked per backend

---

## Phase 4: media-audio Plugin (Week 5)

**Goal:** Audio/TTS generation.

**What to build:**
- `packages/plugins/media-audio/` — audio generation plugin
- ElevenLabs backend (high quality TTS, API-based)
- Edge TTS backend (free, system-based)
- Agent tools: `generate_audio`, `search_audio`

**Key files:**
```
packages/plugins/media-audio/
├── src/
│   ├── worker.ts
│   ├── backends/
│   │   ├── elevenlabs.ts
│   │   └── edge-tts.ts
│   ├── tools/
│   │   ├── generate-audio.ts
│   │   └── search-audio.ts
│   └── manifest.ts
```

**Acceptance criteria:**
- [ ] Agent can generate audio from text
- [ ] Multiple voices/styles supported
- [ ] Audio stored with metadata
- [ ] Cost tracked

---

## Phase 5: media-dashboard UI (Week 6)

**Goal:** Dashboard widget to view generated media.

**What to build:**
- `packages/plugins/media-dashboard/` — UI plugin
- Gallery widget showing recent media assets
- Generation status widget showing active jobs
- Filter by type (video/image/audio), agent, date

**UI slots:**
- `dashboardWidget` — Media gallery on main dashboard
- `detailTab` on agent pages — Agent's generated media

**Key files:**
```
packages/plugins/media-dashboard/
├── src/
│   ├── ui/
│   │   ├── GalleryWidget.tsx
│   │   ├── GenerationStatus.tsx
│   │   └── index.ts
│   ├── worker.ts
│   └── manifest.ts
```

**Acceptance criteria:**
- [ ] Dashboard shows gallery of recent media
- [ ] Can filter by type/agent/date
- [ ] Shows generation status (queued/running/done/failed)
- [ ] Click to view/download asset

---

## Phase 6: Integration & Testing (Week 6-7)

**Goal:** Wire everything together and verify.

**Tasks:**
- [ ] Add all plugins to Levi's plugin workspace
- [ ] Test end-to-end: agent calls tool → job queued → media generated → stored → visible in dashboard
- [ ] Test cost tracking integration
- [ ] Test company-scoped asset isolation
- [ ] Test failure/retry scenarios
- [ ] Add documentation

**Verification commands:**
```bash
# Build all media packages
cd /Users/omkandpal/Levi
pnpm --filter @paperclipai/media-* build

# Typecheck
pnpm --filter @paperclipai/media-* typecheck

# Install plugin in Levi (local path)
# POST /api/plugins/install with { "packageName": "/path/to/media-image", "isLocalPath": true }

# Test tool execution
# POST /api/plugins/tools/execute with { "toolName": "generate_image", "params": { "prompt": "..." } }
```

---

## File Structure Summary

```
packages/plugins/
├── media-core/              # Shared infrastructure (Week 1)
│   ├── src/
│   │   ├── index.ts
│   │   ├── storage.ts
│   │   ├── queue.ts
│   │   ├── cost.ts
│   │   └── types.ts
│   ├── src/manifest.ts
│   ├── src/worker.ts
│   └── package.json
├── media-image/             # Image generation (Week 2)
│   ├── src/
│   │   ├── worker.ts
│   │   ├── backends/
│   │   │   ├── stable-diffusion.ts
│   │   │   └── dall-e.ts
│   │   └── manifest.ts
│   └── package.json
├── media-video/             # Video generation (Week 3-4)
│   ├── src/
│   │   ├── worker.ts
│   │   ├── backends/
│   │   │   ├── comfyui.ts
│   │   │   ├── ffmpeg.ts
│   │   │   └── runway.ts
│   │   └── manifest.ts
│   └── package.json
├── media-audio/             # Audio generation (Week 5)
│   ├── src/
│   │   ├── worker.ts
│   │   ├── backends/
│   │   │   ├── elevenlabs.ts
│   │   │   └── edge-tts.ts
│   │   └── manifest.ts
│   └── package.json
└── media-dashboard/         # UI widget (Week 6)
    ├── src/
    │   ├── ui/
    │   │   ├── GalleryWidget.tsx
    │   │   └── GenerationStatus.tsx
    │   ├── worker.ts
    │   └── manifest.ts
    └── package.json
```

---

## Critical Implementation Notes

1. **Plugin SDK:** All plugins use `@paperclipai/plugin-sdk` — same pattern as `plugin-hello-world-example` and `plugin-kitchen-sink-example`

2. **Storage:** Use Levi's existing storage provider (`local_disk` or S3). Don't build custom storage.

3. **Cost tracking:** Report to Levi's `cost_events` table via `ctx.metrics.write` or `activity.log.write` with cost data.

4. **Company scope:** All assets must be company-scoped. Use `companyId` from context in every operation.

5. **Self-hosted first:** Prioritize self-hosted backends (ComfyUI, Stable Diffusion, FFmpeg, Edge TTS) over API-based ones to avoid vendor lock-in.

6. **Error handling:** Media generation fails often (GPU OOM, API rate limits). Implement retry with exponential backoff.

7. **Security:** Don't store API keys in plugin config. Use Levi's secret system (`secrets.read-ref`).

---

## PR Strategy

**Recommended:** One PR per phase (6 PRs total) rather than one giant PR.

**PR order:**
1. PR 1: `media-core` framework
2. PR 2: `media-image` plugin
3. PR 3: `media-video` plugin
4. PR 4: `media-audio` plugin
5. PR 5: `media-dashboard` UI
6. PR 6: Integration docs + final fixes

This allows incremental review and testing. Each PR should include:
- Typecheck passing
- Basic manual test (install plugin, run tool, verify output)
- Updated documentation

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| GPU not available for ComfyUI/SD | Fallback to API backends (DALL-E, Runway) |
| Plugin SDK changes | Pin to current workspace version |
| Storage quota exceeded | Implement auto-cleanup of old assets |
| Generation takes too long | Async job queue with progress updates |
| Cost overruns | Budget enforcement in media-core |

---

**Next step:** Start Phase 1 by creating `packages/plugins/media-core/` with the package.json and tsconfig.json, then implement the storage wrapper.
