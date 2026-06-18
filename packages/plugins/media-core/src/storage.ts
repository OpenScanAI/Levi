import { createHash, randomUUID } from "node:crypto";
import { writeFile, mkdir, readFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { MediaAsset, MediaType, StorageConfig } from "./types.js";

function hashBuffer(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildObjectKey(companyId: string, type: MediaType, originalFilename: string | null): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const suffix = randomUUID();
  const filename = originalFilename || `${type}-${suffix}`;
  return `${companyId}/media/${type}/${year}/${month}/${day}/${suffix}-${filename}`;
}

export interface UploadMetadata {
  companyId: string;
  prompt: string;
  params: Record<string, unknown>;
  costCents: number;
  agentId?: string;
  taskId?: string;
  originalFilename?: string;
}

export class MediaStorage {
  private ctx: PluginContext;
  private config: StorageConfig;
  private basePath: string;

  constructor(ctx: PluginContext, config: StorageConfig) {
    this.ctx = ctx;
    this.config = config;
    this.basePath = process.env.MEDIA_STORAGE_PATH || "/tmp/paperclip-media";
  }

  async uploadAsset(
    type: MediaType,
    body: Buffer,
    contentType: string,
    metadata: UploadMetadata
  ): Promise<MediaAsset> {
    const companyId = metadata.companyId;
    const objectKey = buildObjectKey(companyId, type, metadata.originalFilename || null);
    const byteSize = body.length;
    const sha256 = hashBuffer(body);

    const asset: MediaAsset = {
      id: randomUUID(),
      companyId,
      type,
      provider: this.config.provider,
      objectKey,
      contentType,
      byteSize,
      sha256,
      originalFilename: metadata.originalFilename || null,
      prompt: metadata.prompt,
      params: metadata.params,
      costCents: metadata.costCents,
      agentId: metadata.agentId || null,
      taskId: metadata.taskId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store actual file to disk
    if (this.config.provider === "local_disk") {
      const filePath = path.join(this.basePath, objectKey);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
    }
    // TODO: S3 provider integration via Levi StorageService

    // Store metadata in plugin state for retrieval
    await this.ctx.state.set(
      { scopeKind: "company", stateKey: `media-asset:${asset.id}` },
      JSON.stringify(asset)
    );

    // Also index by object key for lookups
    await this.ctx.state.set(
      { scopeKind: "company", stateKey: `media-obj:${objectKey}` },
      asset.id
    );

    this.ctx.logger.info("Media asset stored", { assetId: asset.id, type, objectKey, byteSize });

    return asset;
  }

  async getAsset(assetId: string): Promise<MediaAsset | null> {
    const raw = await this.ctx.state.get({ scopeKind: "company", stateKey: `media-asset:${assetId}` });
    if (!raw) return null;
    try {
      return JSON.parse(raw as string) as MediaAsset;
    } catch {
      return null;
    }
  }

  async getAssetByObjectKey(objectKey: string): Promise<MediaAsset | null> {
    const assetId = await this.ctx.state.get({ scopeKind: "company", stateKey: `media-obj:${objectKey}` });
    if (!assetId) return null;
    return this.getAsset(assetId as string);
  }

  async downloadAsset(assetId: string): Promise<Buffer | null> {
    const asset = await this.getAsset(assetId);
    if (!asset) return null;

    if (this.config.provider === "local_disk") {
      const filePath = path.join(this.basePath, asset.objectKey);
      try {
        return await readFile(filePath);
      } catch (error) {
        this.ctx.logger.error("Failed to read asset file", { assetId, filePath, error: String(error) });
        return null;
      }
    }
    // TODO: S3 provider integration
    return null;
  }

  async searchAssets(filters: {
    companyId?: string;
    type?: MediaType;
    agentId?: string;
    taskId?: string;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  }): Promise<MediaAsset[]> {
    // Plugin state doesn't support querying, so we need to maintain an index
    // For now, return empty array - will be implemented with proper indexing
    this.ctx.logger.warn("Asset search not yet implemented with plugin state");
    return [];
  }

  async deleteAsset(assetId: string): Promise<boolean> {
    const asset = await this.getAsset(assetId);
    if (!asset) return false;

    // Delete actual file
    if (this.config.provider === "local_disk") {
      const filePath = path.join(this.basePath, asset.objectKey);
      try {
        await unlink(filePath);
      } catch (error) {
        this.ctx.logger.warn("Failed to delete asset file", { assetId, filePath, error: String(error) });
      }
    }
    // TODO: S3 provider integration

    await this.ctx.state.delete({ scopeKind: "company", stateKey: `media-asset:${assetId}` });
    await this.ctx.state.delete({ scopeKind: "company", stateKey: `media-obj:${asset.objectKey}` });

    this.ctx.logger.info("Media asset deleted", { assetId });
    return true;
  }

  async cleanupOldAssets(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.maxAssetAgeDays);

    // Plugin state doesn't support date-based querying
    // This will be implemented with proper indexing or database integration
    this.ctx.logger.warn("Asset cleanup not yet implemented with plugin state");
    return 0;
  }
}
