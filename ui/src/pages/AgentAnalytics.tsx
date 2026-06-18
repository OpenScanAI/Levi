import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, TrendingUp, DollarSign, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { costsApi } from "../api/costs";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn, formatCents } from "../lib/utils";
import type { Agent, HeartbeatRun, CostByAgent } from "@paperclipai/shared";
import { TooltipProps } from "recharts";

/* ── Tooltip Components ── */

function CostTooltipContent(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: Array<unknown> };
  if (!active || !payload?.length) return null;
  const data = (payload[0] as { payload: CostDataPoint }).payload;
  return (
    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
      <div className="font-medium">{data.name}</div>
      <div className="text-muted-foreground">Cost: {data.costFormatted}</div>
    </div>
  );
}

function RateTooltipContent(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: Array<unknown> };
  if (!active || !payload?.length) return null;
  const data = (payload[0] as { payload: RateDataPoint }).payload;
  return (
    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
      <div className="font-medium">{data.name}</div>
      <div className="text-muted-foreground">{data.value}% ({data.count} runs)</div>
    </div>
  );
}

/* ── Types ── */

interface AgentPerformanceData {
  agent: Agent;
  runs: HeartbeatRun[];
  cost: CostByAgent | null;
}

interface TimeSeriesPoint {
  date: string;
  label: string;
  completed: number;
  failed: number;
}

interface CostDataPoint {
  name: string;
  cost: number;
  costFormatted: string;
}

interface RateDataPoint {
  name: string;
  value: number;
  count: number;
}

/* ── Constants ── */

const COLORS = {
  success: "#10b981",
  failed: "#ef4444",
  warning: "#eab308",
  neutral: "#6b7280",
  primary: "#3b82f6",
  secondary: "#8b5cf6",
};

const PIE_COLORS = [COLORS.success, COLORS.failed, COLORS.warning, COLORS.neutral];

/* ── Utilities ── */

function getLast30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function aggregateRunsByDay(runs: HeartbeatRun[]): TimeSeriesPoint[] {
  const days = getLast30Days();
  const grouped = new Map<string, { completed: number; failed: number }>();

  for (const day of days) {
    grouped.set(day, { completed: 0, failed: 0 });
  }

  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (run.status === "succeeded") {
      entry.completed++;
    } else if (run.status === "failed" || run.status === "timed_out") {
      entry.failed++;
    }
  }

  return days.map((day) => ({
    date: day,
    label: formatDayLabel(day),
    completed: grouped.get(day)!.completed,
    failed: grouped.get(day)!.failed,
  }));
}

/* ── Sub-components ── */

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      {trend && (
        <div className={cn("text-xs font-medium", trendUp ? "text-emerald-500" : "text-red-500")}>
          {trendUp ? "↑" : "↓"} {trend}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border rounded-lg p-4 space-y-3", className)}>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function AgentSelector({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={selectedId === "all" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect("all")}
      >
        All Agents
      </Button>
      {agents.map((agent) => (
        <Button
          key={agent.id}
          variant={selectedId === agent.id ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(agent.id)}
        >
          {agent.name}
        </Button>
      ))}
    </div>
  );
}

/* ── Custom Tooltip ── */

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md p-2 shadow-md text-xs">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ── */

export function AgentAnalytics() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [selectedAgentId, setSelectedAgentId] = useState<string | "all">("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "Analytics" },
    ]);
  }, [setBreadcrumbs]);

  /* Fetch data */
  const {
    data: agents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: runs,
    isLoading: runsLoading,
    error: runsError,
  } = useQuery({
    queryKey: [...queryKeys.heartbeats(selectedCompanyId!), "analytics"],
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 1000),
    enabled: !!selectedCompanyId,
  });

  const {
    data: costs,
    isLoading: costsLoading,
    error: costsError,
  } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!),
    queryFn: () => costsApi.byAgent(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const isLoading = agentsLoading || runsLoading || costsLoading;
  const error = agentsError || runsError || costsError;

  /* Filtered data */
  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    if (selectedAgentId === "all") return runs;
    return runs.filter((run) => run.agentId === selectedAgentId);
  }, [runs, selectedAgentId]);

  const filteredCosts = useMemo(() => {
    if (!costs) return [];
    if (selectedAgentId === "all") return costs;
    return costs.filter((cost) => cost.agentId === selectedAgentId);
  }, [costs, selectedAgentId]);

  /* Computed metrics */
  const timeSeriesData = useMemo(() => aggregateRunsByDay(filteredRuns), [filteredRuns]);

  const costData: CostDataPoint[] = useMemo(() => {
    return filteredCosts.map((c) => ({
      name: c.agentName || c.agentId.slice(0, 8),
      cost: c.costCents / 100,
      costFormatted: formatCents(c.costCents),
    }));
  }, [filteredCosts]);

  const approvalRateData: RateDataPoint[] = useMemo(() => {
    const total = filteredRuns.length;
    if (total === 0) return [];
    const succeeded = filteredRuns.filter((r) => r.status === "succeeded").length;
    const failed = filteredRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const other = total - succeeded - failed;

    return [
      { name: "Success", value: Math.round((succeeded / total) * 100), count: succeeded },
      { name: "Failed", value: Math.round((failed / total) * 100), count: failed },
      ...(other > 0 ? [{ name: "Other", value: Math.round((other / total) * 100), count: other }] : []),
    ];
  }, [filteredRuns]);

  const errorRateData: RateDataPoint[] = useMemo(() => {
    const total = filteredRuns.length;
    if (total === 0) return [];
    const failed = filteredRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const errorRate = Math.round((failed / total) * 100);
    const successRate = 100 - errorRate;

    return [
      { name: "Success", value: successRate, count: total - failed },
      { name: "Error", value: errorRate, count: failed },
    ];
  }, [filteredRuns]);

  /* Summary stats */
  const totalRuns = filteredRuns.length;
  const totalSucceeded = filteredRuns.filter((r) => r.status === "succeeded").length;
  const totalFailed = filteredRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
  const totalCostSum = filteredCosts.reduce((sum, c) => sum + c.costCents, 0);
  const avgCostComputed = totalRuns > 0 ? Math.round(totalCostSum / totalRuns) : 0;
  const successRate = totalRuns > 0 ? Math.round((totalSucceeded / totalRuns) * 100) : 0;
  const errorRateComputed = totalRuns > 0 ? Math.round((totalFailed / totalRuns) * 100) : 0;

  /* Loading state */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Agent Performance Analytics</h1>
        </div>
        <PageSkeleton variant="dashboard" />
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Agent Performance Analytics</h1>
        </div>
        <div className="border border-destructive/50 rounded-lg p-6 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-medium">Failed to load analytics</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error ? error.message : "An unexpected error occurred."}
          </p>
        </div>
      </div>
    );
  }

  /* Empty state - no agents */
  if (!agents || agents.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Agent Performance Analytics</h1>
        </div>
        <EmptyState
          icon={BarChart3}
          message="No agents found. Create an agent to see performance analytics."
        />
      </div>
    );
  }

  /* Empty state - no runs data */
  const hasNoData = totalRuns === 0 && costData.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Agent Performance Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track agent productivity, costs, and success rates over time.
          </p>
        </div>
      </div>

      {/* Agent selector */}
      <AgentSelector
        agents={agents}
        selectedId={selectedAgentId}
        onSelect={setSelectedAgentId}
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Total Runs"
          value={String(totalRuns)}
          subtitle={selectedAgentId === "all" ? "Across all agents" : "For selected agent"}
          icon={TrendingUp}
        />
        <MetricCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${totalSucceeded} succeeded`}
          icon={CheckCircle}
          trend={`${totalFailed} failed`}
          trendUp={successRate >= 80}
        />
        <MetricCard
          title="Error Rate"
          value={`${errorRateComputed}%`}
          subtitle={`${totalFailed} errors`}
          icon={XCircle}
          trend={errorRateComputed > 20 ? "High" : "Low"}
          trendUp={errorRateComputed <= 20}
        />
        <MetricCard
          title="Avg Cost / Run"
          value={formatCents(avgCostComputed)}
          subtitle={selectedAgentId === "all" ? "Average across agents" : "Per run"}
          icon={DollarSign}
        />
      </div>

      {/* No data state */}
      {hasNoData ? (
        <EmptyState
          icon={BarChart3}
          message="No performance data available yet. Data will appear once agents start running tasks."
        />
      ) : (
        /* Charts */
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Tasks completed over time */}
          <ChartCard
            title="Tasks Completed Over Time"
            subtitle="Daily run volume for the last 30 days"
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeSeriesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={COLORS.success}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke={COLORS.failed}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Average cost per task */}
          <ChartCard
            title="Average Cost Per Task"
            subtitle="Total cost by agent"
          >
            {costData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No cost data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickFormatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Tooltip content={<CostTooltipContent />} />
                  <Bar dataKey="cost" name="Cost ($)" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Approval rate (success rate pie) */}
          <ChartCard
            title="Success Rate Distribution"
            subtitle="Run outcome breakdown"
          >
            {approvalRateData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No run data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={approvalRateData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                    label={true}
                    labelLine={false}
                    style={{ fontSize: 12 }}
                  >
                    {approvalRateData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<RateTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Error rate */}
          <ChartCard
            title="Error Rate"
            subtitle="Failed vs successful runs"
            className="lg:col-span-2"
          >
            {errorRateData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No run data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={errorRateData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(value: number) => `${value}%`}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    width={60}
                  />
                  <Tooltip content={<RateTooltipContent />} />
                  <Bar
                    dataKey="value"
                    name="Percentage"
                    radius={[0, 4, 4, 0]}
                    fill={COLORS.failed}
                  >
                    {errorRateData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name === "Success" ? COLORS.success : COLORS.failed}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
