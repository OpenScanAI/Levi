import { api } from "./client";
export type MemoryType = "decision" | "error" | "code_change" | "architecture" | "preference" | "discussion";

export interface MemoryMetadata {
  company_id: string;
  project_id: string;
  agent_id: string;
  task_id: string;
  goal_ancestry: string[];
  agent_role: string;
  timestamp: string;
  run_id: string;
  cost: number;
  memory_type: MemoryType;
  visibility: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  namespace: string;
  confidence: number;
  relevanceScore?: number;
}

export interface MemorySearchFilters {
  q: string;
  agentRole?: string;
  memoryType?: MemoryType;
  from?: string;
  to?: string;
  topK?: number;
}

export interface MemorySearchResponse {
  query: string;
  projectId: string;
  companyId: string;
  count: number;
  memories: MemoryItem[];
}

export interface PinMemoryInput {
  pinned: boolean;
}

export interface PinMemoryResponse {
  id: string;
  pinned: boolean;
  success: boolean;
}

export interface MergeMemoriesInput {
  sourceIds: string[];
  targetId: string;
}

export interface MergeMemoriesResponse {
  targetId: string;
  sourceIds: string[];
  mergedCount: number;
  success: boolean;
}

export const memoryApi = {
  search: (companyId: string, projectId: string, filters: MemorySearchFilters) => {
    const params = new URLSearchParams();
    params.set("q", filters.q);
    if (filters.agentRole) params.set("agentRole", filters.agentRole);
    if (filters.memoryType) params.set("memoryType", filters.memoryType);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.topK) params.set("topK", String(filters.topK));
    return api.get<MemorySearchResponse>(
      `/companies/${companyId}/projects/${projectId}/memory/search?${params.toString()}`,
    );
  },

  pin: (memoryId: string, input: PinMemoryInput) =>
    api.post<PinMemoryResponse>(`/memory/${memoryId}/pin`, input),

  delete: (memoryId: string) => api.delete<void>(`/memory/${memoryId}`),

  merge: (input: MergeMemoriesInput) => api.post<MergeMemoriesResponse>("/memory/merge", input),
};
