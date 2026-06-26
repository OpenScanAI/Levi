export interface DashboardRunActivityDay {
  date: string;
  succeeded: number;
  failed: number;
  other: number;
  total: number;
}

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
  runActivity: DashboardRunActivityDay[];
}

export interface AgentFinding {
  id: string;
  companyId: string;
  agentId: string;
  runId: string | null;
  severity: import("../constants.js").FindingSeverity;
  category: string | null;
  title: string;
  description: string | null;
  cvssScore: number | null;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentReport {
  id: string;
  companyId: string;
  type: import("../constants.js").ReportType;
  title: string;
  contentJson: Record<string, unknown> | null;
  pdfUrl: string | null;
  logoAssetId: string | null;
  generatedBy: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationConfig {
  id: string;
  companyId: string;
  type: import("../constants.js").NotificationType;
  targetUrl: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunTag {
  id: string;
  companyId: string;
  runId: string;
  tag: string;
  createdAt: string;
}
