import { useState } from "react";
import type { DashboardSummary } from "@paperclipai/shared";
import { RotateCcw, CheckCircle2, XCircle, AlertTriangle, TrendingUp, ChevronRight, Bot, ChevronDown, Info } from "lucide-react";
import { RetryTrendChart } from "./RetryTrendChart";
import { ChartCard } from "./ActivityCharts";

interface RecoveryMetricProps {
  icon: React.ElementType;
  value: string | number;
  label: string;
  subtext?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

function RecoveryMetric({ icon: Icon, value, label, subtext, tone = "neutral" }: RecoveryMetricProps) {
  const toneClasses = {
    neutral: "text-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className="flex items-start gap-3 px-4 py-4 rounded-lg border bg-card">
      <div className={`mt-0.5 ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-2xl font-semibold tracking-tight tabular-nums ${toneClasses[tone]}`}>
          {value}
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
        {subtext && <p className="text-[11px] text-muted-foreground/70 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}

interface RecoveryCenterProps {
  retries: DashboardSummary["retries"];
}

export function RecoveryCenter({ retries }: RecoveryCenterProps) {
  const [showDetails, setShowDetails] = useState(false);

  const hasRetries = retries.totalRetries > 0;
  const recoveryRateText = `${retries.recoveryRate}%`;

  // Empty state: compact informational card
  if (!hasRetries) {
    return (
      <div className="border rounded-lg bg-card/50">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <RotateCcw className="h-4 w-4 text-muted-foreground/60" />
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recovery Center
              </h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                No retry activity in the last 24 hours
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground/60 hidden sm:inline">All systems healthy</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground/60 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </div>
        </button>

        {showDetails && (
          <div className="px-4 pb-4 pt-1 border-t border-border/50">
            <div className="flex items-start gap-3 py-3">
              <Info className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Automatic retries activate when agents encounter transient failures.
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Metrics will appear here when retries occur. The system monitors connection errors,
                  rate limits, and temporary service outages.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40">
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground/60">0 auto retries</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/40" />
                <span className="text-xs text-muted-foreground/60">0 recovered</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40">
                <XCircle className="h-3.5 w-3.5 text-amber-500/40" />
                <span className="text-xs text-muted-foreground/60">0 failed</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500/40" />
                <span className="text-xs text-muted-foreground/60">0 exhausted</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active state: full metrics, charts, and details
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recovery Center
          </h3>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {showDetails ? "Hide details" : "View details"}
          <ChevronRight className={`h-3 w-3 transition-transform ${showDetails ? "rotate-90" : ""}`} />
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RecoveryMetric
          icon={RotateCcw}
          value={retries.totalRetries}
          label="Auto Retries"
          subtext="Last 24 hours"
          tone="neutral"
        />
        <RecoveryMetric
          icon={CheckCircle2}
          value={retries.successfulRetries}
          label="Recovered"
          subtext={`${recoveryRateText} recovery rate`}
          tone="success"
        />
        <RecoveryMetric
          icon={XCircle}
          value={retries.failedRetries}
          label="Failed after retry"
          subtext="Requires attention"
          tone="warning"
        />
        <RecoveryMetric
          icon={AlertTriangle}
          value={retries.exhaustedRetries}
          label="Exhausted"
          subtext="Max retries reached"
          tone={retries.exhaustedRetries > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* Trend Chart */}
      {retries.retryActivity.length > 0 && (
        <ChartCard title="Retry Trend" subtitle="Last 24 hours">
          <RetryTrendChart activity={retries.retryActivity} />
        </ChartCard>
      )}

      {/* Drill-down Details */}
      {showDetails && retries.topAgents.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Agents with Retries
            </h4>
          </div>
          <div className="divide-y divide-border">
            {retries.topAgents.map((agent) => (
              <div key={agent.agentId} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{agent.agentName || "Unnamed agent"}</span>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {agent.successCount}
                  </span>
                  <span className="flex items-center gap-1 text-amber-600">
                    <XCircle className="h-3 w-3" />
                    {agent.failureCount}
                  </span>
                  <span className="text-muted-foreground">
                    {agent.retryCount} total
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
