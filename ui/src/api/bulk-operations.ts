import { api } from "./client";

export interface BulkImportRepo {
  url: string;
  branch?: string | null;
}

export interface BulkImportResult {
  url: string;
  success: boolean;
  agentId?: string;
  agentName?: string;
  error?: string;
}

export interface BulkImportResponse {
  results: BulkImportResult[];
}

export interface BulkUpdateRequest {
  agentIds: string[];
  action: "enable" | "disable" | "terminate";
}

export interface BulkUpdateResponse {
  updated: number;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    urlKey: string;
  }>;
}

export interface AgentComparison {
  id: string;
  name: string;
  status: string;
  role: string;
  adapterType: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  successRate: number;
  findingsCount: number;
  sourceRepo?: string;
  urlKey: string;
}

export const bulkOperationsApi = {
  bulkImport: (companyId: string, repos: BulkImportRepo[]) =>
    api.post<BulkImportResponse>(`/companies/${companyId}/agents/bulk-import`, { repos }),
  bulkUpdate: (companyId: string, request: BulkUpdateRequest) =>
    api.post<BulkUpdateResponse>(`/companies/${companyId}/agents/bulk`, request),
  compare: (companyId: string, agentIds: string[]) =>
    api.post<AgentComparison[]>(`/companies/${companyId}/agents/compare`, { agentIds }),
};
