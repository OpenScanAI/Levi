import { randomUUID } from "node:crypto";
import type { PluginContext, PluginJobContext } from "@paperclipai/plugin-sdk";
import type { MediaJob, MediaType, JobStatus, StorageConfig } from "./types.js";

export class MediaQueue {
  private ctx: PluginContext;
  private config: StorageConfig;
  private runningJobs: Map<string, MediaJob> = new Map();

  constructor(ctx: PluginContext, config: StorageConfig) {
    this.ctx = ctx;
    this.config = config;
  }

  async submit(params: {
    companyId: string;
    type: MediaType;
    backend: string;
    params: Record<string, unknown>;
    agentId?: string;
    taskId?: string;
  }): Promise<MediaJob> {
    const job: MediaJob = {
      id: randomUUID(),
      companyId: params.companyId,
      type: params.type,
      backend: params.backend,
      params: params.params,
      status: "queued",
      agentId: params.agentId || null,
      taskId: params.taskId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store job in plugin state
    await this.ctx.state.set(
      { scopeKind: "company", stateKey: `media-job:${job.id}` },
      JSON.stringify(job)
    );

    // Add to queue index
    const queueKey = `media-queue:${params.companyId}`;
    const existingQueue = await this.ctx.state.get({ scopeKind: "company", stateKey: queueKey });
    const queue: string[] = existingQueue ? JSON.parse(existingQueue as string) : [];
    queue.push(job.id);
    await this.ctx.state.set(
      { scopeKind: "company", stateKey: queueKey },
      JSON.stringify(queue)
    );

    this.ctx.logger.info("Media job queued", { jobId: job.id, type: params.type, backend: params.backend });

    return job;
  }

  async getJob(jobId: string): Promise<MediaJob | null> {
    const raw = await this.ctx.state.get({ scopeKind: "company", stateKey: `media-job:${jobId}` });
    if (!raw) return null;
    try {
      return JSON.parse(raw as string) as MediaJob;
    } catch {
      return null;
    }
  }

  async updateStatus(jobId: string, status: JobStatus, result?: { assetId?: string; error?: string }): Promise<MediaJob | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    job.status = status;
    job.updatedAt = new Date().toISOString();

    if (status === "running") {
      job.startedAt = new Date().toISOString();
      this.runningJobs.set(jobId, job);
    }

    if (status === "succeeded" || status === "failed" || status === "cancelled") {
      job.finishedAt = new Date().toISOString();
      if (result?.assetId) job.resultAssetId = result.assetId;
      if (result?.error) job.error = result.error;
      this.runningJobs.delete(jobId);
    }

    await this.ctx.state.set(
      { scopeKind: "company", stateKey: `media-job:${jobId}` },
      JSON.stringify(job)
    );

    this.ctx.logger.info("Media job status updated", { jobId, status });
    return job;
  }

  async getQueue(companyId: string): Promise<MediaJob[]> {
    const queueKey = `media-queue:${companyId}`;
    const raw = await this.ctx.state.get({ scopeKind: "company", stateKey: queueKey });
    if (!raw) return [];

    const jobIds: string[] = JSON.parse(raw as string);
    const jobs: MediaJob[] = [];
    for (const id of jobIds) {
      const job = await this.getJob(id);
      if (job) jobs.push(job);
    }
    return jobs;
  }

  async getRunningJobs(): Promise<MediaJob[]> {
    return Array.from(this.runningJobs.values());
  }

  async canAcceptJob(): Promise<boolean> {
    return this.runningJobs.size < this.config.maxConcurrentJobs;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) return false;
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      return false;
    }

    await this.updateStatus(jobId, "cancelled");
    return true;
  }
}
