import { describe, it, expect, beforeEach } from "vitest";
import { MediaStorage, MediaQueue, MediaCostTracker } from "../index.js";
import type { PluginContext } from "@paperclipai/plugin-sdk";

// Mock PluginContext for testing
function createMockContext(): PluginContext {
  const state = new Map<string, string>();
  const logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];

  return {
    state: {
      async get(key: { scopeKind: string; stateKey: string }) {
        return state.get(JSON.stringify(key)) || null;
      },
      async set(key: { scopeKind: string; stateKey: string }, value: string) {
        state.set(JSON.stringify(key), value);
      },
      async delete(key: { scopeKind: string; stateKey: string }) {
        state.delete(JSON.stringify(key));
      },
    },
    logger: {
      info: (msg: string, meta?: Record<string, unknown>) => logs.push({ level: "info", message: msg, meta }),
      warn: (msg: string, meta?: Record<string, unknown>) => logs.push({ level: "warn", message: msg, meta }),
      error: (msg: string, meta?: Record<string, unknown>) => logs.push({ level: "error", message: msg, meta }),
      debug: (msg: string, meta?: Record<string, unknown>) => logs.push({ level: "debug", message: msg, meta }),
    },
    config: {
      async get() {
        return { storageProvider: "local_disk", maxAssetAgeDays: 30, maxConcurrentJobs: 3 };
      },
    },
    metrics: {
      async write(name: string, value: number, tags?: Record<string, string>) {
        // no-op for testing
      },
    },
    activity: {
      async log(entry: { companyId: string; message: string }) {
        // no-op for testing
      },
    },
  } as unknown as PluginContext;
}

describe("MediaStorage", () => {
  let ctx: PluginContext;
  let storage: MediaStorage;

  beforeEach(() => {
    ctx = createMockContext();
    storage = new MediaStorage(ctx, { provider: "local_disk", maxAssetAgeDays: 30, maxConcurrentJobs: 3 });
  });

  it("should upload and retrieve an asset", async () => {
    const body = Buffer.from("test image data");
    const asset = await storage.uploadAsset("image", body, "image/png", {
      companyId: "test-company",
      prompt: "test prompt",
      params: { backend: "test" },
      costCents: 0,
    });

    expect(asset).toBeDefined();
    expect(asset.id).toBeDefined();
    expect(asset.type).toBe("image");
    expect(asset.byteSize).toBe(body.length);
    expect(asset.prompt).toBe("test prompt");

    const retrieved = await storage.getAsset(asset.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(asset.id);
  });

  it("should store actual file to disk", async () => {
    const body = Buffer.from("test image data for file storage");
    const asset = await storage.uploadAsset("image", body, "image/png", {
      companyId: "test-company",
      prompt: "file storage test",
      params: { backend: "test" },
      costCents: 0,
    });

    // Verify file was written to disk
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const basePath = process.env.MEDIA_STORAGE_PATH || "/tmp/paperclip-media";
    const filePath = path.join(basePath, asset.objectKey);
    
    const fileContent = await fs.readFile(filePath);
    expect(fileContent.toString()).toBe(body.toString());
  });

  it("should delete asset and file", async () => {
    const body = Buffer.from("test data for deletion");
    const asset = await storage.uploadAsset("image", body, "image/png", {
      companyId: "test-company",
      prompt: "delete test",
      params: { backend: "test" },
      costCents: 0,
    });

    const deleted = await storage.deleteAsset(asset.id);
    expect(deleted).toBe(true);

    const retrieved = await storage.getAsset(asset.id);
    expect(retrieved).toBeNull();
  });
});

describe("MediaQueue", () => {
  let ctx: PluginContext;
  let queue: MediaQueue;

  beforeEach(() => {
    ctx = createMockContext();
    queue = new MediaQueue(ctx, { provider: "local_disk", maxAssetAgeDays: 30, maxConcurrentJobs: 3 });
  });

  it("should submit and update job status", async () => {
    const job = await queue.submit({
      companyId: "test-company",
      type: "image",
      backend: "stable_diffusion",
      params: { prompt: "test" },
    });

    expect(job).toBeDefined();
    expect(job.status).toBe("queued");

    await queue.updateStatus(job.id, "running");
    const updated = await queue.getJob(job.id);
    expect(updated?.status).toBe("running");

    await queue.updateStatus(job.id, "succeeded", { assetId: "test-asset-id" });
    const completed = await queue.getJob(job.id);
    expect(completed?.status).toBe("succeeded");
    expect(completed?.resultAssetId).toBe("test-asset-id");
  });
});

describe("MediaCostTracker", () => {
  let ctx: PluginContext;
  let tracker: MediaCostTracker;

  beforeEach(() => {
    ctx = createMockContext();
    tracker = new MediaCostTracker(ctx);
  });

  it("should report cost without error", async () => {
    await expect(tracker.reportCost({
      companyId: "test-company",
      agentId: "test-agent",
      taskId: "test-task",
      provider: "openai",
      model: "dall-e-3",
      costCents: 4,
    })).resolves.not.toThrow();
  });
});
