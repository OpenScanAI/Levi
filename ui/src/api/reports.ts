import type { ReportType } from "@paperclipai/shared";
import { api } from "./client";

export interface Report {
  id: string;
  companyId: string;
  type: ReportType;
  title: string;
  contentJson: Record<string, unknown>;
  pdfUrl: string | null;
  logoAssetId: string | null;
  generatedBy: string | null;
  generatedAt: Date | null;
  createdAt: Date;
}

export interface ReportsListResponse {
  reports: Report[];
  total: number;
  limit: number;
  offset: number;
}

export const reportsApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<ReportsListResponse>(`/companies/${companyId}/reports${query}`);
  },
  get: (companyId: string, id: string) =>
    api.get<Report>(`/companies/${companyId}/reports/${id}`),
  create: (companyId: string, body: {
    type: ReportType;
    title: string;
    contentJson?: Record<string, unknown>;
    logoAssetId?: string | null;
    generatedBy?: string | null;
  } & Record<string, unknown>) => api.post<Report>(`/companies/${companyId}/reports`, body),
  delete: (companyId: string, id: string) =>
    api.delete<{ deleted: true }>(`/companies/${companyId}/reports/${id}`),
};
