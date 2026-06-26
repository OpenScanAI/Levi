import type { FindingSeverity } from "@paperclipai/shared";
import { api } from "./client";

export interface Finding {
  id: string;
  companyId: string;
  agentId: string;
  runId: string | null;
  severity: FindingSeverity;
  category: string | null;
  title: string;
  description: string | null;
  cvssScore: number | null;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindingsListResponse {
  findings: Finding[];
  total: number;
  limit: number;
  offset: number;
}

export interface FindingsSummaryItem {
  severity: FindingSeverity;
  count: number;
  verified: number;
  unverified: number;
}

export const findingsApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<FindingsListResponse>(`/companies/${companyId}/findings${query}`);
  },
  summary: (companyId: string) =>
    api.get<FindingsSummaryItem[]>(`/companies/${companyId}/findings/summary`),
  get: (companyId: string, id: string) =>
    api.get<Finding>(`/companies/${companyId}/findings/${id}`),
  create: (companyId: string, body: {
    agentId: string;
    runId?: string | null;
    severity: FindingSeverity;
    category?: string | null;
    title: string;
    description?: string | null;
    cvssScore?: number | null;
    metadata?: Record<string, unknown> | null;
  }) => api.post<Finding>(`/companies/${companyId}/findings`, body),
  update: (companyId: string, id: string, body: Partial<{
    severity: FindingSeverity;
    category: string | null;
    title: string;
    description: string | null;
    cvssScore: number | null;
    metadata: Record<string, unknown> | null;
  }>) => api.patch<Finding>(`/companies/${companyId}/findings/${id}`, body),
  verify: (companyId: string, id: string, verifiedBy?: string) =>
    api.post<Finding>(`/companies/${companyId}/findings/${id}/verify`, { verifiedBy }),
  delete: (companyId: string, id: string) =>
    api.delete<{ deleted: true }>(`/companies/${companyId}/findings/${id}`),
};
