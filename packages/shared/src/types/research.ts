// ─────────────────────────────────────────────────────────────────────────────
// Research Domain Types
// ─────────────────────────────────────────────────────────────────────────────

// Enums (mirrors DB enums)
export type ResearchSessionStatus =
  | "planning"
  | "running"
  | "cancelling"
  | "paused"
  | "completed"
  | "failed";

export type ResearchTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ResearchFindingConfidence = "high" | "medium" | "low";

export type ResearchDepth = "shallow" | "medium" | "deep";

// ─────────────────────────────────────────────────────────────────────────────
// Research Session
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchSession {
  id: string;
  companyId: string;
  title: string;
  query: string;
  status: ResearchSessionStatus;
  plan: ResearchPlan | null;
  report: string | null;
  originalReport: string | null;
  isEdited: boolean;
  progressPercent: number;
  depth: ResearchDepth;
  maxSubtopics: number;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSessionListItem {
  id: string;
  title: string;
  query: string;
  status: ResearchSessionStatus;
  progressPercent: number;
  depth: ResearchDepth;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSessionDetail extends ResearchSession {
  tasks: ResearchTaskListItem[];
  findings: ResearchFinding[];
  sources: ResearchSource[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Plan
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchPlan {
  subtopics: ResearchSubtopic[];
  strategy: string;
}

export interface ResearchSubtopic {
  id: string;
  title: string;
  description: string;
  priority: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Task
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchTask {
  id: string;
  sessionId: string;
  companyId: string;
  title: string;
  status: ResearchTaskStatus;
  findingsSummary: string | null;
  sources: ResearchSourceSnippet[];
  reliabilityScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  sequenceOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTaskListItem {
  id: string;
  title: string;
  status: ResearchTaskStatus;
  reliabilityScore: number | null;
  sequenceOrder: number;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Finding
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchFinding {
  id: string;
  taskId: string;
  sessionId: string;
  companyId: string;
  content: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceDomain: string | null;
  confidence: ResearchFindingConfidence;
  reliabilityScore: number | null;
  category: string | null;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ResearchFindingListItem {
  id: string;
  content: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  confidence: ResearchFindingConfidence;
  category: string | null;
  isDuplicate: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Source
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchSource {
  id: string;
  sessionId: string;
  companyId: string;
  url: string;
  title: string | null;
  domain: string | null;
  reliabilityScore: number | null;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
}

export interface ResearchSourceSnippet {
  url: string;
  title: string;
  snippet?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Memory
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchMemory {
  id: string;
  companyId: string;
  key: string;
  value: unknown;
  sessionId: string | null;
  sourceFindingId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Research Report
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchReport {
  sessionId: string;
  title: string;
  query: string;
  markdown: string;
  generatedAt: string;
  findingsCount: number;
  sourcesCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateResearchSessionRequest {
  title: string;
  query: string;
  depth?: ResearchDepth;
  maxSubtopics?: number;
  plan?: ResearchPlan;
}

export interface UpdateResearchSessionRequest {
  title?: string;
  query?: string;
  status?: ResearchSessionStatus;
  depth?: ResearchDepth;
  maxSubtopics?: number;
  report?: string;
}

export interface CreateResearchTaskRequest {
  title: string;
  sequenceOrder?: number;
}

export interface UpdateResearchTaskRequest {
  title?: string;
  status?: ResearchTaskStatus;
  findingsSummary?: string;
  sources?: ResearchSourceSnippet[];
  reliabilityScore?: number;
}

export interface CreateResearchFindingRequest {
  taskId: string;
  content: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceDomain?: string;
  confidence?: ResearchFindingConfidence;
  reliabilityScore?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface MarkDuplicateRequest {
  duplicateOfId: string;
}

export interface CreateResearchMemoryRequest {
  key: string;
  value: unknown;
  sessionId?: string;
  sourceFindingId?: string;
}

export interface ResearchDashboardSummary {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalFindings: number;
  totalSources: number;
  recentSessions: ResearchSessionListItem[];
}
