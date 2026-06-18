import type {
  ResearchSession,
  ResearchSessionDetail,
  ResearchTask,
  ResearchFinding,
  ResearchSource,
  CreateResearchSessionRequest,
  UpdateResearchSessionRequest,
  CreateResearchTaskRequest,
  UpdateResearchTaskRequest,
  CreateResearchFindingRequest,
  MarkDuplicateRequest,
  CreateResearchMemoryRequest,
  ResearchDashboardSummary,
} from "@paperclipai/shared";
import { api } from "./client";

export interface ResearchDashboard {
  sessions: {
    total: number;
    byStatus: Record<string, number>;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
  };
  findings: {
    total: number;
    duplicates: number;
    avgReliability: number | null;
  };
  sources: {
    total: number;
  };
}

export interface PaginatedFindings {
  items: ResearchFinding[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedSessions {
  items: ResearchSession[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedFindings {
  items: ResearchFinding[];
  total: number;
  limit: number;
  offset: number;
}

export const researchApi = {
  // Dashboard
  dashboard: (companyId: string) =>
    api.get<ResearchDashboard>(`/companies/${companyId}/research/dashboard`),

  // Sessions
  listSessions: (companyId: string, params?: { status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    return api.get<PaginatedSessions>(`/companies/${companyId}/research/sessions${qs ? `?${qs}` : ""}`);
  },

  createSession: (companyId: string, data: CreateResearchSessionRequest) =>
    api.post<ResearchSession>(`/companies/${companyId}/research/sessions`, data),

  getSession: (companyId: string, sessionId: string) =>
    api.get<ResearchSessionDetail>(
      `/companies/${companyId}/research/sessions/${sessionId}`
    ),

  updateSession: (companyId: string, sessionId: string, data: UpdateResearchSessionRequest) =>
    api.patch<ResearchSession>(`/companies/${companyId}/research/sessions/${sessionId}`, data),

  deleteSession: (companyId: string, sessionId: string) =>
    api.delete<void>(`/companies/${companyId}/research/sessions/${sessionId}`),

  startSession: (companyId: string, sessionId: string) =>
    api.post<{ started: boolean; sessionId: string }>(`/companies/${companyId}/research/sessions/${sessionId}/start`, {}),

  cancelSession: (companyId: string, sessionId: string) =>
    api.post<{ cancelled: boolean; sessionId: string }>(`/companies/${companyId}/research/sessions/${sessionId}/cancel`, {}),

  resumeSession: (companyId: string, sessionId: string) =>
    api.post<{ resumed: boolean; sessionId: string }>(`/companies/${companyId}/research/sessions/${sessionId}/resume`, {}),

  retryTask: (companyId: string, sessionId: string, taskId: string) =>
    api.post<{ retried: boolean; taskId: string; sessionId: string }>(`/companies/${companyId}/research/sessions/${sessionId}/tasks/${taskId}/retry`, {}),

  // Tasks
  listTasks: (companyId: string, sessionId: string) =>
    api.get<ResearchTask[]>(`/companies/${companyId}/research/sessions/${sessionId}/tasks`),

  createTask: (companyId: string, sessionId: string, data: CreateResearchTaskRequest) =>
    api.post<ResearchTask>(`/companies/${companyId}/research/sessions/${sessionId}/tasks`, data),

  getTask: (companyId: string, taskId: string) =>
    api.get<ResearchTask>(`/companies/${companyId}/research/tasks/${taskId}`),

  updateTask: (companyId: string, taskId: string, data: UpdateResearchTaskRequest) =>
    api.patch<ResearchTask>(`/companies/${companyId}/research/tasks/${taskId}`, data),

  // Findings
  listFindings: (companyId: string, taskId: string, params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    return api.get<PaginatedFindings>(`/companies/${companyId}/research/tasks/${taskId}/findings${qs ? `?${qs}` : ""}`);
  },

  createFinding: (companyId: string, data: CreateResearchFindingRequest) =>
    api.post<ResearchFinding>(`/companies/${companyId}/research/findings`, data),

  markDuplicate: (companyId: string, findingId: string, data: MarkDuplicateRequest) =>
    api.post<ResearchFinding>(`/companies/${companyId}/research/findings/${findingId}/mark-duplicate`, data),

  // Sources
  listSources: (companyId: string, sessionId: string) =>
    api.get<ResearchSource[]>(`/companies/${companyId}/research/sessions/${sessionId}/sources`),

  // Engine (already defined above)

  // Subtopic Generation
  generateSubtopics: (companyId: string, data: { query: string; depth?: string; maxSubtopics?: number }) =>
    api.post<{ strategy: string; subtopics: Array<{ id: string; title: string; description: string; priority: number }> }>(`/companies/${companyId}/research/generate-subtopics`, data),

  // Memory
  getMemory: (companyId: string, key?: string) => {
    const qs = key ? `?key=${encodeURIComponent(key)}` : "";
    return api.get<unknown>(`/companies/${companyId}/research/memory${qs}`);
  },

  setMemory: (companyId: string, data: CreateResearchMemoryRequest) =>
    api.post<unknown>(`/companies/${companyId}/research/memory`, data),
};
