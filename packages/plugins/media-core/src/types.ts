export type MediaType = "image" | "video" | "audio";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface MediaAsset {
  id: string;
  companyId: string;
  type: MediaType;
  provider: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
  prompt: string;
  params: Record<string, unknown>;
  costCents: number;
  agentId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaJob {
  id: string;
  companyId: string;
  type: MediaType;
  backend: string;
  params: Record<string, unknown>;
  status: JobStatus;
  agentId: string | null;
  taskId: string | null;
  resultAssetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface StorageConfig {
  provider: "local_disk" | "s3";
  maxAssetAgeDays: number;
  maxConcurrentJobs: number;
}

export interface CostReport {
  companyId: string;
  agentId: string | null;
  taskId: string | null;
  provider: string;
  model: string;
  costCents: number;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}
