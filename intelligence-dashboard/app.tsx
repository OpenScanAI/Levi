import {
  type PluginPageProps,
  type PluginSidebarProps,
  useHostNavigation,
  usePluginData,
  usePluginAction,
} from "@paperclipai/plugin-sdk/ui";
import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──

type AgentActivity = {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksFailed: number;
  avgDuration: number;
  lastActivity: string;
  status: "active" | "idle" | "error";
};

type ProjectEvent = {
  id: string;
  type: "commit" | "agent_run" | "error" | "warning" | "info";
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type DashboardStats = {
  totalAgents: number;
  activeAgents: number;
  errorAgents: number;
  idleAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  openIssues: number;
  inProgressIssues: number;
  blockedIssues: number;
  doneIssues: number;
};

type AlertItem = {
  severity: "warning" | "critical";
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  suggestedAssignee: string;
};

type RetryTask = {
  id: string;
  agentId: string;
  agentName: string;
  taskId: string;
  taskName: string;
  error: string;
  failedAt: string;
  retryCount: number;
  maxRetries: number;
  status: string;
};

type GitHubFailure = {
  type: string;
  issueNumber: number;
  title: string;
  description: string;
  suggestedFix: string;
  severity: "high" | "medium" | "low";
  htmlUrl: string;
  repoOwner: string;
  repoName: string;
};

type GitHubPR = {
  number: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  draft: boolean;
  mergeable: boolean | null;
  checksStatus: "passing" | "failing" | "pending" | "unknown";
  reviewStatus: "approved" | "changes_requested" | "pending" | "unknown";
  repoOwner: string;
  repoName: string;
};

type DashboardData = {
  timestamp: string;
  agents: AgentActivity[];
  events: ProjectEvent[];
  stats: DashboardStats;
  alerts: AlertItem[];
};

type ActiveProjectData = {
  activeProject: {
    name: string;
    repo: string;
    score: number;
    lastActivity: number;
    currentBranch: string;
    timeSpent: number;
  } | null;
  allProjects: Array<{
    name: string;
    repo: string;
    score: number;
    lastActivity: number;
    lastFileEdit: number;
    lastCommit: number;
    currentBranch: string;
    timeSpent: number;
    recentEdits: number;
    recentCommits: number;
  }>;
};

// ── CSS ──

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

.intel-dashboard { min-height:100%; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:#09090b; color:#e4e4e7; }

/* Hide Paperclip's Back button - target parent scope */
a[href*="/plugins"] ~ main > a:first-child,
main > a:first-of-type,
[data-testid="plugin-back-button"],
.plugin-page-back,
main > a:only-of-type { display:none !important; }

/* Alert Banners */
.intel-alerts-container { display:flex; flex-direction:column; gap:0; }
.intel-alert-banner { display:flex; align-items:center; gap:12px; padding:14px 24px; font-size:13px; background:#2D1B69; color:#c4b5fd; }
.intel-alert-banner.critical { background:#450a0a; color:#fca5a5; }
.intel-alert-banner.warning { background:#3f2c06; color:#fcd34d; }
.intel-alert-icon { font-size:16px; flex-shrink:0; }
.intel-alert-content { flex:1; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.intel-alert-title { font-weight:700; }
.intel-alert-actions { display:flex; gap:10px; flex-shrink:0; }
.intel-btn { padding:6px 16px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:none; transition:all 0.15s; font-family:inherit; }
.intel-btn-green { background:#15803d; color:#fff; }
.intel-btn-green:hover { background:#166534; }
.intel-btn-red { background:#b91c1c; color:#fff; }
.intel-btn-red:hover { background:#991b1b; }
.intel-btn-outline { background:transparent; color:currentColor; border:1px solid currentColor; opacity:0.8; }
.intel-btn-outline:hover { opacity:1; }

/* Header Section */
.intel-header-section { padding:24px 32px 16px; }
.intel-header-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; }
.intel-header-title { font-size:24px; font-weight:800; color:#fafafa; margin:0; letter-spacing:-0.02em; }
.intel-header-subtitle { font-size:13px; color:#a1a1aa; margin-top:4px; }
.intel-header-actions { display:flex; align-items:center; gap:12px; }
.intel-status-pill { display:flex; align-items:center; gap:6px; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; }
.intel-status-pill.critical { background:rgba(185,28,28,0.15); color:#f87171; border:1px solid rgba(185,28,28,0.3); }
.intel-status-pill.warning { background:rgba(161,98,7,0.15); color:#fbbf24; border:1px solid rgba(161,98,7,0.3); }
.intel-status-dot { width:6px; height:6px; border-radius:50%; }
.intel-status-dot.red { background:#dc2626; }
.intel-status-dot.yellow { background:#fbbf24; }
.intel-status-dot.green { background:#16a34a; }
.intel-refresh-btn { padding:6px 16px; background:transparent; color:#a1a1aa; border:1px solid rgba(161,161,170,0.2); border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; }
.intel-refresh-btn:hover { background:rgba(161,161,170,0.1); color:#e4e4e7; }

/* Tabs */
.intel-tabs { display:flex; gap:4px; border-bottom:1px solid rgba(161,161,170,0.1); padding:0 32px; }
.intel-tab { padding:10px 20px; background:transparent; border:none; border-bottom:2px solid transparent; color:#71717a; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; margin-bottom:-1px; }
.intel-tab:hover { color:#a1a1aa; }
.intel-tab.active { color:#d4d4d8; border-bottom-color:#d4d4d8; }
.intel-tab-badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; border-radius:9px; background:#dc2626; color:#fff; font-size:10px; font-weight:700; margin-left:6px; }

/* Content */
.intel-content { padding:24px 32px; }
.intel-section-title { font-size:14px; font-weight:700; color:#a1a1aa; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:16px; }

/* Metric Cards */
.intel-metrics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-bottom:32px; }
.intel-metric-card { background:#18181b; border:1px solid rgba(161,161,170,0.08); border-radius:10px; padding:20px; text-align:center; transition:all 0.2s; }
.intel-metric-card:hover { border-color:rgba(212,212,216,0.2); transform:translateY(-1px); }
.intel-metric-value { font-size:28px; font-weight:800; color:#fafafa; line-height:1; margin-bottom:6px; }
.intel-metric-label { font-size:12px; color:#71717a; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; }

/* Two Column Layout */
.intel-two-col { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.intel-panel { background:#18181b; border:1px solid rgba(161,161,170,0.08); border-radius:12px; padding:24px; }
.intel-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
.intel-panel-title { font-size:16px; font-weight:700; color:#fafafa; }
.intel-panel-badge { padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; }

/* Issues List */
.intel-issues-list { width:100%; display:flex; flex-direction:column; gap:10px; }
.intel-issue-item { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#09090b; border-radius:8px; font-size:13px; }
.intel-issue-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.intel-issue-dot.critical { background:#dc2626; }
.intel-issue-dot.warning { background:#fbbf24; }
.intel-issue-dot.green { background:#16a34a; }
.intel-issue-text { color:#d4d4d8; font-weight:500; }
.intel-issue-count { font-size:11px; color:#71717a; font-weight:600; margin-left:auto; }

/* Overview */
.intel-overview-list { display:flex; flex-direction:column; gap:16px; }
.intel-overview-item { display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(161,161,170,0.06); }
.intel-overview-item:last-child { border-bottom:none; }
.intel-overview-label { font-size:13px; color:#a1a1aa; font-weight:500; }
.intel-overview-value { font-size:14px; font-weight:700; color:#fafafa; }
.intel-overview-value.teal { color:#14b8a6; }
.intel-overview-value.gold { color:#fbbf24; }
.intel-overview-value.red { color:#ef4444; }

/* Loading */
.intel-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; gap:20px; color:#71717a; }
.intel-spinner { width:40px; height:40px; border:3px solid #18181b; border-top-color:#d4d4d8; border-radius:50%; animation:spin 0.8s linear infinite; }

/* Animations */
@keyframes spin { to { transform:rotate(360deg); } }

/* Responsive */
@media (max-width:1024px) {
  .intel-metrics-grid { grid-template-columns:repeat(2,1fr); }
  .intel-two-col { grid-template-columns:1fr; }
}
@media (max-width:640px) {
  .intel-metrics-grid { grid-template-columns:1fr; }
  .intel-header-section { padding:16px; }
  .intel-content { padding:16px; }
  .intel-tabs { padding:0 16px; }
}
`;

// ── Helpers ──

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main Hook ──

function useDashboardData(companyId: string | null) {
  const params = companyId ? { companyId } : {};
  const { data, loading, error, refresh } = usePluginData<{ data: DashboardData }>("dashboard", params);
  const { data: retriesData } = usePluginData<{ tasks: RetryTask[] }>("failed-tasks", params);
  const { data: githubData } = usePluginData<{ failures: GitHubFailure[] }>("github-failures", params);
  const { data: prsData } = usePluginData<{ prs: GitHubPR[] }>("github-prs", params);
  const { data: activeProjectData, refresh: refreshActiveProject } = usePluginData<ActiveProjectData>("active-project", params);

  return {
    dashboard: data?.data || null,
    pendingRetries: retriesData?.tasks || [],
    githubFailures: githubData?.failures || [],
    githubPRs: prsData?.prs || [],
    activeProject: activeProjectData?.activeProject || null,
    allProjects: activeProjectData?.allProjects || [],
    refreshActiveProject,
    loading,
    error,
    refresh,
  };
}

// ── Main Page ──

export function IntelligencePage(props: PluginPageProps) {
  const companyId = props.context?.companyId || null;
  const { dashboard, pendingRetries, githubFailures, githubPRs, activeProject, allProjects, refreshActiveProject, loading, error, refresh } = useDashboardData(companyId);
  const [tab, setTab] = useState<"overview" | "agents" | "activity" | "notifications" | "github-failures" | "github-prs">("overview");
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [retryResults, setRetryResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [selectedProject, setSelectedProject] = useState<string>("");

  // Filter issues/PRs by selected project
  const effectiveProjectRepo = selectedProject || activeProject?.repo || "";
  const filteredFailures = effectiveProjectRepo 
    ? githubFailures.filter(f => `${f.repoOwner}/${f.repoName}` === effectiveProjectRepo)
    : githubFailures;
  const filteredPRs = effectiveProjectRepo
    ? githubPRs.filter(pr => `${pr.repoOwner}/${pr.repoName}` === effectiveProjectRepo)
    : githubPRs;

  const retryTask = usePluginAction("retry-task");
  const skipTask = usePluginAction("skip-task");
  const refreshSnapshot = usePluginAction("refresh");

  const handleRetry = useCallback(async (taskId: string) => {
    try {
      const result = await retryTask({ taskId });
      setRetryResults(prev => ({ ...prev, [taskId]: result as { success: boolean; message: string } }));
      setTimeout(() => refresh(), 2000);
    } catch (err) {
      setRetryResults(prev => ({ ...prev, [taskId]: { success: false, message: String(err) } }));
    }
  }, [retryTask, refresh]);

  const handleSkip = useCallback(async (taskId: string) => {
    try {
      const result = await skipTask({ taskId });
      setRetryResults(prev => ({ ...prev, [taskId]: result as { success: boolean; message: string } }));
      setTimeout(() => refresh(), 1000);
    } catch (err) {
      setRetryResults(prev => ({ ...prev, [taskId]: { success: false, message: String(err) } }));
    }
  }, [skipTask, refresh]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSnapshot({});
      refresh();
      refreshActiveProject();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshSnapshot, refresh, refreshActiveProject]);

  if (loading) return (
    <div className="intel-dashboard">
      <style>{CSS}</style>
      <div className="intel-loading">
        <div className="intel-spinner" />
        <p>Loading Intelligence Dashboard...</p>
      </div>
    </div>
  );

  if (error || !dashboard) return (
    <div className="intel-dashboard">
      <style>{CSS}</style>
      <div className="intel-loading">
        <div style={{ fontSize: 48 }}>--</div>
        <div>{error ? `Error: ${error.message}` : "Could not load dashboard data."}</div>
        <button className="intel-btn intel-btn-green" onClick={handleRefresh}>Retry Connection</button>
      </div>
    </div>
  );

  const activeAlerts = dashboard.alerts.filter(a => !dismissedAlerts.has(a.metric));
  const criticalCount = activeAlerts.filter(a => a.severity === "critical").length;
  const warningCount = activeAlerts.filter(a => a.severity === "warning").length;

  return (
    <div className="intel-dashboard">
      <style>{CSS}</style>

      {/* Header */}
      <div className="intel-header-section">
        <div className="intel-header-top">
          <div>
            <h1 className="intel-header-title">Intelligence Dashboard</h1>
            <div className="intel-header-subtitle">Real-time Paperclip analytics</div>
          </div>
          <div className="intel-header-actions">
            {allProjects.length > 0 && (
              <select
                className="intel-project-select"
                value={selectedProject || activeProject?.repo || ""}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: "#1e293b",
                  color: "#e2e8f0",
                  border: "1px solid rgba(148,163,184,0.2)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {allProjects.map((p) => (
                  <option key={p.repo} value={p.repo}>
                    {p.name} {p.name === activeProject?.name ? "(active)" : ""}
                  </option>
                ))}
              </select>
            )}
            {criticalCount > 0 && (
              <span className="intel-status-pill critical">
                <span className="intel-status-dot red" />
                {criticalCount} Critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="intel-status-pill warning">
                <span className="intel-status-dot yellow" />
                {warningCount} Warnings
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="intel-tabs">
        {[
          { key: "overview" as const, label: "Overview" },
          { key: "agents" as const, label: "Agents" },
          { key: "activity" as const, label: "Activity" },
          { key: "notifications" as const, label: "Notifications", badge: pendingRetries.length + activeAlerts.length },
          { key: "github-failures" as const, label: "GitHub Issues", badge: filteredFailures.length },
          { key: "github-prs" as const, label: "Pull Requests", badge: filteredPRs.length },
        ].map(t => (
          <button key={t.key} className={`intel-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge ? <span className="intel-tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="intel-content">
        {tab === "overview" && (
          <>
            {/* Metric Cards - REAL DATA */}
            <div className="intel-section-title">Project Metrics</div>
            <div className="intel-metrics-grid">
              <div className="intel-metric-card">
                <div className="intel-metric-value">{formatNumber(dashboard.stats.totalAgents)}</div>
                <div className="intel-metric-label">Total Agents</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value" style={{ color: "#10b981" }}>{formatNumber(dashboard.stats.activeAgents)}</div>
                <div className="intel-metric-label">Active</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value" style={{ color: "#ef4444" }}>{formatNumber(dashboard.stats.errorAgents)}</div>
                <div className="intel-metric-label">In Error</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value" style={{ color: "#fbbf24" }}>{formatNumber(dashboard.stats.idleAgents)}</div>
                <div className="intel-metric-label">Idle</div>
              </div>
            </div>

            <div className="intel-metrics-grid" style={{ marginBottom: 32 }}>
              <div className="intel-metric-card">
                <div className="intel-metric-value">{formatNumber(dashboard.stats.openIssues)}</div>
                <div className="intel-metric-label">Open Issues</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value">{formatNumber(dashboard.stats.inProgressIssues)}</div>
                <div className="intel-metric-label">In Progress</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value" style={{ color: "#ef4444" }}>{formatNumber(dashboard.stats.blockedIssues)}</div>
                <div className="intel-metric-label">Blocked</div>
              </div>
              <div className="intel-metric-card">
                <div className="intel-metric-value" style={{ color: "#10b981" }}>{formatNumber(dashboard.stats.doneIssues)}</div>
                <div className="intel-metric-label">Done</div>
              </div>
            </div>

            {/* Two Column */}
            <div className="intel-two-col">
              {/* Agents Status */}
              <div className="intel-panel">
                <div className="intel-panel-header">
                  <span className="intel-panel-title">Agent Status</span>
                  <span className="intel-panel-badge" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                    {dashboard.stats.activeAgents} Active
                  </span>
                </div>
                <div className="intel-issues-list">
                  {dashboard.agents.map((agent, idx) => (
                    <div key={idx} className="intel-issue-item">
                      <span className="intel-issue-dot" style={{
                        background: agent.status === "active" ? "#10b981" : agent.status === "error" ? "#ef4444" : "#64748b"
                      }} />
                      <span className="intel-issue-text">{agent.agentName}</span>
                      <span className="intel-issue-count" style={{
                        color: agent.status === "active" ? "#10b981" : agent.status === "error" ? "#ef4444" : "#64748b"
                      }}>
                        {agent.status === "active" ? "Active" : agent.status === "error" ? "Error" : "Idle"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="intel-panel">
                <div className="intel-panel-header">
                  <span className="intel-panel-title">Recent Activity</span>
                </div>
                <div className="intel-issues-list">
                  {dashboard.events.slice(0, 8).map((event, idx) => (
                    <div key={idx} className="intel-issue-item">
                      <span className="intel-issue-dot" style={{
                        background: event.type === "error" ? "#ef4444" : event.type === "warning" ? "#fbbf24" : "#3b82f6"
                      }} />
                      <span className="intel-issue-text">{event.message}</span>
                      <span className="intel-issue-count">{timeAgo(event.timestamp)}</span>
                    </div>
                  ))}
                  {dashboard.events.length === 0 && (
                    <div className="intel-issue-item" style={{ justifyContent: "center", color: "#64748b" }}>
                      No recent activity
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "agents" && (
          <div className="intel-panel">
            <div className="intel-panel-header">
              <span className="intel-panel-title">All Agents</span>
              <span className="intel-panel-badge" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                {dashboard.stats.activeAgents} Active / {dashboard.stats.totalAgents} Total
              </span>
            </div>
            <div className="intel-issues-list">
              {dashboard.agents.map((agent, idx) => (
                <div key={idx} className="intel-issue-item">
                  <span className="intel-issue-dot" style={{
                    background: agent.status === "active" ? "#10b981" : agent.status === "error" ? "#ef4444" : "#64748b"
                  }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
                    <span className="intel-issue-text">{agent.agentName}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>ID: {agent.agentId.slice(0, 8)}...</span>
                  </div>
                  <span className="intel-issue-count" style={{
                    color: agent.status === "active" ? "#10b981" : agent.status === "error" ? "#ef4444" : "#64748b"
                  }}>
                    {agent.status === "active" ? "Active" : agent.status === "error" ? "Error" : "Idle"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="intel-panel">
            <div className="intel-panel-header">
              <span className="intel-panel-title">Activity Feed</span>
              <span className="intel-panel-badge" style={{ background: "rgba(59,130,246,0.1)", color: "#60a5fa" }}>
                {dashboard.events.length} Events
              </span>
            </div>
            <div className="intel-issues-list">
              {dashboard.events.map((event, idx) => (
                <div key={idx} className="intel-issue-item">
                  <span className="intel-issue-dot" style={{
                    background: event.type === "error" ? "#ef4444" : event.type === "warning" ? "#fbbf24" : event.type === "agent_run" ? "#10b981" : "#3b82f6"
                  }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
                    <span className="intel-issue-text">{event.message}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                  <span className="intel-issue-count">{timeAgo(event.timestamp)}</span>
                </div>
              ))}
              {dashboard.events.length === 0 && (
                <div className="intel-issue-item" style={{ justifyContent: "center", color: "#64748b" }}>
                  No activity recorded
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <>
            {/* Alerts */}
            {activeAlerts.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="intel-section-title">Active Alerts</div>
                <div className="intel-alerts-container">
                  {activeAlerts.map((alert, idx) => (
                    <div key={idx} className={`intel-alert-banner ${alert.severity}`}>
                      <span className="intel-alert-icon">{alert.severity === "critical" ? "(!)" : "(i)"}</span>
                      <div className="intel-alert-content">
                        <span className="intel-alert-title">{alert.metric}</span>
                        <span>{alert.message}</span>
                        <span style={{ opacity: 0.7 }}>Value: {alert.currentValue} (threshold: {alert.threshold})</span>
                      </div>
                      <div className="intel-alert-actions">
                        <button className="intel-btn intel-btn-outline" onClick={() => setDismissedAlerts(prev => new Set([...prev, alert.metric]))}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed Tasks */}
            <div className="intel-section-title">Failed Tasks</div>
            <div className="intel-panel">
              <div className="intel-panel-header">
                <span className="intel-panel-title">Pending Actions</span>
                <span className="intel-panel-badge" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                  {pendingRetries.length} Pending
                </span>
              </div>
              <div className="intel-issues-list">
                {pendingRetries.length === 0 ? (
                  <div className="intel-issue-item" style={{ justifyContent: "center", color: "#64748b" }}>
                    No failed tasks - all agents healthy!
                  </div>
                ) : (
                  pendingRetries.map((task, idx) => (
                    <div key={idx} className="intel-issue-item">
                      <span className="intel-issue-dot critical" />
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
                        <span className="intel-issue-text">{task.agentName} — {task.taskName}</span>
                        <span style={{ fontSize: 11, color: "#f87171" }}>{task.error}</span>
                      </div>
                      <div className="intel-alert-actions">
                        {retryResults[task.id]?.success ? (
                          <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 600 }}>{retryResults[task.id]?.message}</span>
                        ) : (
                          <>
                            <button className="intel-btn intel-btn-green" onClick={() => handleRetry(task.id)}>Retry</button>
                            <button className="intel-btn intel-btn-red" onClick={() => handleSkip(task.id)}>Skip</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {tab === "github-failures" && (
          <>
            {filteredFailures.length === 0 ? (
              <div className="intel-panel">
                <div className="intel-panel-header">
                  <span className="intel-panel-title">All Clear{effectiveProjectRepo ? ` — ${effectiveProjectRepo}` : ""}</span>
                </div>
                <div className="intel-issues-list">
                  <div className="intel-issue-item" style={{ justifyContent: "center", color: "#71717a" }}>
                    No GitHub issues need attention right now.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="intel-section-title">Issues Need Attention ({filteredFailures.length}){effectiveProjectRepo ? ` — ${effectiveProjectRepo}` : ""}</div>
                {filteredFailures.map((f, idx) => (
                  <div key={idx} className="intel-panel" style={{ marginBottom: 16, borderLeft: f.severity === "high" ? "3px solid #dc2626" : f.severity === "medium" ? "3px solid #fbbf24" : "3px solid #3b82f6" }}>
                    <div className="intel-panel-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="intel-panel-badge" style={{
                          background: f.severity === "high" ? "rgba(185,28,28,0.15)" : f.severity === "medium" ? "rgba(161,98,7,0.15)" : "rgba(59,130,246,0.15)",
                          color: f.severity === "high" ? "#f87171" : f.severity === "medium" ? "#fbbf24" : "#60a5fa"
                        }}>
                          {f.severity.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 13, color: "#71717a" }}>#{f.issueNumber}</span>
                        <span style={{ fontSize: 11, color: "#71717a", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: 4 }}>{f.repoOwner}/{f.repoName}</span>
                      </div>
                      <span className="intel-panel-badge" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 11 }}>
                        {f.type.replace("_", " ")}
                      </span>
                    </div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15, color: "#fafafa", fontWeight: 700 }}>{f.title}</h4>
                    <p style={{ margin: "0 0 16px", fontSize: 13, color: "#a1a1aa", lineHeight: 1.5 }}>{f.description}</p>
                    <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                      <strong style={{ display: "block", fontSize: 13, color: "#16a34a", marginBottom: 8 }}>How to fix:</strong>
                      <pre style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, fontFamily: "'Inter', ui-monospace, monospace" }}>{f.suggestedFix}</pre>
                    </div>
                    <a
                      href={f.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(99,102,241,0.1)", color: "#818cf8", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid rgba(99,102,241,0.2)" }}
                    >
                      View on GitHub →
                    </a>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {tab === "github-prs" && (
          <>
            {filteredPRs.length === 0 ? (
              <div className="intel-panel">
                <div className="intel-panel-header">
                  <span className="intel-panel-title">No Open PRs{effectiveProjectRepo ? ` — ${effectiveProjectRepo}` : ""}</span>
                </div>
                <div className="intel-issues-list">
                  <div className="intel-issue-item" style={{ justifyContent: "center", color: "#71717a" }}>
                    No open pull requests right now.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="intel-section-title">Open Pull Requests ({filteredPRs.length}){effectiveProjectRepo ? ` — ${effectiveProjectRepo}` : ""}</div>
                {filteredPRs.map((pr, idx) => (
                  <div key={idx} className="intel-panel" style={{ marginBottom: 16, borderLeft: pr.checksStatus === "failing" ? "3px solid #dc2626" : pr.reviewStatus === "changes_requested" ? "3px solid #fbbf24" : "3px solid #16a34a" }}>
                    <div className="intel-panel-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="intel-panel-badge" style={{
                          background: pr.draft ? "rgba(100,116,139,0.15)" : pr.checksStatus === "failing" ? "rgba(185,28,28,0.15)" : pr.checksStatus === "passing" ? "rgba(22,163,74,0.15)" : "rgba(161,98,7,0.15)",
                          color: pr.draft ? "#94a3b8" : pr.checksStatus === "failing" ? "#f87171" : pr.checksStatus === "passing" ? "#34d399" : "#fbbf24"
                        }}>
                          {pr.draft ? "DRAFT" : pr.checksStatus.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 13, color: "#71717a" }}>#{pr.number}</span>
                        <span style={{ fontSize: 11, color: "#71717a", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: 4 }}>{pr.repoOwner}/{pr.repoName}</span>
                      </div>
                      <span className="intel-panel-badge" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 11 }}>
                        {pr.reviewStatus.replace("_", " ")}
                      </span>
                    </div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 15, color: "#fafafa", fontWeight: 700 }}>{pr.title}</h4>
                    <p style={{ margin: "0 0 12px", fontSize: 13, color: "#a1a1aa" }}>
                      By <strong style={{ color: "#e4e4e7" }}>{pr.author}</strong> • {timeAgo(pr.createdAt)}
                    </p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#71717a" }}>Updated {timeAgo(pr.updatedAt)}</span>
                      {pr.mergeable !== null && (
                        <span style={{ fontSize: 12, color: pr.mergeable ? "#16a34a" : "#dc2626" }}>
                          {pr.mergeable ? "Mergeable" : "Has Conflicts"}
                        </span>
                      )}
                    </div>
                    <a
                      href={pr.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "8px 16px", background: "rgba(99,102,241,0.1)", color: "#818cf8", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid rgba(99,102,241,0.2)" }}
                    >
                      View on GitHub →
                    </a>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sidebar Link ──

export function SidebarLink(props: PluginSidebarProps) {
  const nav = useHostNavigation();
  return (
    <button
      onClick={() => nav.navigate("/intelligence")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderRadius: "6px",
        color: props.isActive ? "#d4d4d8" : "#a1a1aa",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: "13px", fontFamily: "monospace", opacity: 0.7 }}>◈</span>
      <span>Intelligence</span>
    </button>
  );
}
