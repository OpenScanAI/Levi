import { api } from "./client";

export interface AgentRun {
  id: string;
  companyId: string;
  agentId: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunTag {
  id: string;
  companyId: string;
  runId: string;
  tag: string;
  createdAt: Date;
}

export interface RunsListResponse {
  runs: AgentRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  stuck: number;
}

export const agentRunsApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<RunsListResponse>(`/companies/${companyId}/runs${query}`);
  },
  stats: (companyId: string) =>
    api.get<RunStats>(`/companies/${companyId}/runs/stats`),
  get: (companyId: string, id: string) =>
    api.get<AgentRun>(`/companies/${companyId}/runs/${id}`),
  getTags: (companyId: string, id: string) =>
    api.get<RunTag[]>(`/companies/${companyId}/runs/${id}/tags`),
  addTag: (companyId: string, id: string, tag: string) =>
    api.post<RunTag>(`/companies/${companyId}/runs/${id}/tags`, { tag }),
  removeTag: (companyId: string, id: string, tagId: string) =>
    api.delete<{ deleted: true }>(`/companies/${companyId}/runs/${id}/tags/${tagId}`),
};
