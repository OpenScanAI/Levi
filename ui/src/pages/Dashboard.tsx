import { useEffect, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { cn, formatCents } from "../lib/utils";
import { LayoutDashboard, Bot, CircleDot, DollarSign, ShieldCheck, Activity, PauseCircle } from "lucide-react";
import type { Agent } from "@paperclipai/shared";

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: "idle" | "paused" | "running" | "error";
  currentTask: string | null;
}

function StatusDot({ status }: { status: AgentStatus["status"] }) {
  const colors = {
    idle: "bg-emerald-500",
    paused: "bg-amber-500",
    running: "bg-blue-500 animate-pulse",
    error: "bg-red-500",
  };

  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", colors[status])} />
      <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", colors[status])} />
    </span>
  );
}

function AgentRow({ agent }: { agent: AgentStatus }) {
  return (
    <Link
      to={`/agents/${agent.id}`}
      className="flex items-center gap-4 py-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer no-underline text-inherit block"
    >
      <StatusDot status={agent.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{agent.name}</span>
          <span className="text-xs text-muted-foreground">({agent.role})</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {agent.status === "idle" && "Idle, no active task"}
          {agent.status === "paused" && "Paused, no active task"}
          {agent.status === "running" && (agent.currentTask || "Running...")}
          {agent.status === "error" && "Error state"}
        </div>
      </div>
    </Link>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
  description,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  description: string;
  to?: string;
}) {
  const content = (
    <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="block no-underline text-inherit">{content}</Link>;
  }
  return content;
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: dashboardData } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentStatuses = useMemo<AgentStatus[]>(() => {
    if (!agents) return [];
    return agents.map((agent: Agent) => {
      // Determine status from agent data
      let status: AgentStatus["status"] = "idle";
      if (agent.status === "paused") status = "paused";
      else if (agent.status === "running") status = "running";
      else if (agent.status === "error") status = "error";

      return {
        id: agent.id,
        name: agent.name,
        role: agent.role || "agent",
        status,
        currentTask: null,
      };
    });
  }, [agents]);

  const activeAgents = agentStatuses.filter((a) => a.status === "running");
  const idleAgents = agentStatuses.filter((a) => a.status === "idle" || a.status === "paused" || a.status === "error");

  const taskMetrics = useMemo(() => {
    if (!issues) return { inProgress: 0, open: 0, blocked: 0 };
    const inProgress = issues.filter((i) => i.status === "in_progress").length;
    const open = issues.filter((i) => i.status === "todo").length;
    const blocked = issues.filter((i) => i.status === "blocked").length;
    return { inProgress, open, blocked };
  }, [issues]);

  const monthSpend = dashboardData?.costs?.monthSpendCents ?? 0;
  const monthBudget = dashboardData?.costs?.monthBudgetCents ?? 0;
  const pendingApprovals = (dashboardData?.pendingApprovals ?? 0) + (dashboardData?.budgets?.pendingApprovals ?? 0);

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* System Status Header */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">System Status</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold text-foreground">{activeAgents.length}</span>
          <span className="text-sm text-muted-foreground">agents active</span>
        </div>
        {activeAgents.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            No active agents currently running
          </p>
        )}
        {activeAgents.length > 0 && (
          <div className="mt-3 space-y-2">
            {activeAgents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2 text-sm">
                <StatusDot status="running" />
                <span className="font-medium">{agent.name}</span>
                <span className="text-muted-foreground">— {agent.currentTask || "Running"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Idle Agents Section */}
      {idleAgents.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Idle Agents
            </h3>
          </div>
          <div className="divide-y divide-border">
            {idleAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* System Metrics Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Bot}
          value={agentStatuses.length}
          label="Agents Enabled"
          description="Total configured agents"
          to="/agents"
        />
        <MetricCard
          icon={CircleDot}
          value={taskMetrics.inProgress}
          label="Tasks in Progress"
          description={`${taskMetrics.open} open, ${taskMetrics.blocked} blocked`}
          to="/issues"
        />
        <MetricCard
          icon={DollarSign}
          value={formatCents(monthSpend)}
          label="Month Spend"
          description={monthBudget > 0 ? `${Math.round((monthSpend / monthBudget) * 100)}% of budget` : "Unlimited budget"}
          to="/costs"
        />
        <MetricCard
          icon={ShieldCheck}
          value={pendingApprovals}
          label="Pending Approvals"
          description="Awaiting board review"
          to="/approvals"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link
          to="/agents"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Bot className="h-4 w-4" />
          Manage Agents
        </Link>
        <Link
          to="/issues"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-accent transition-colors"
        >
          <CircleDot className="h-4 w-4" />
          View Tasks
        </Link>
        <Link
          to="/approvals"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-accent transition-colors"
        >
          <ShieldCheck className="h-4 w-4" />
          Approvals
        </Link>
      </div>
    </div>
  );
}
