export interface DashboardRunActivityDay {
  date: string;
  succeeded: number;
  failed: number;
  other: number;
  total: number;
}

export interface DashboardRetryActivityDay {
  date: string;
  retried: number;
  recovered: number;
  failedAfterRetries: number;
  exhausted: number;
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
  retries: {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    exhaustedRetries: number;
    recoveryRate: number;
    retryActivity: DashboardRetryActivityDay[];
    topAgents: Array<{
      agentId: string;
      agentName: string;
      retryCount: number;
      successCount: number;
      failureCount: number;
    }>;
  };
}
