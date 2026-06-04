import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import * as fs from "fs";

const PLUGIN_NAME = "intelligence-dashboard";
const PAPERCLIP_API = "http://localhost:3100/api";
const FALLBACK_COMPANY_ID = "9975a9e0-9845-43eb-b33b-7e6b122b4a82";

// ── Load .env from plugin directory ──
function loadEnv() {
  try {
    const envPath = new URL("../.env", import.meta.url).pathname;
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const idx = line.indexOf("=");
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          if (key && value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // Ignore env loading errors
  }
}
loadEnv();

// GitHub config from env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
let GITHUB_OWNER = process.env.GITHUB_OWNER || "nehaaagre16-create";
let GITHUB_REPO = process.env.GITHUB_REPO || "Bug-reporter-dashboard";

// ── Multi-Project Config ──
interface ProjectConfig {
  name: string;
  repo: string;
  path: string;
}

function loadProjects(): ProjectConfig[] {
  const projects: ProjectConfig[] = [];
  let i = 1;
  while (process.env[`PROJECT_${i}_NAME`]) {
    projects.push({
      name: process.env[`PROJECT_${i}_NAME`]!,
      repo: process.env[`PROJECT_${i}_REPO`]!,
      path: process.env[`PROJECT_${i}_PATH`]!,
    });
    i++;
  }
  return projects;
}

const PROJECTS = loadProjects();

// ── Types ──
interface GitHubFailure {
  type: string;
  issueNumber: number;
  title: string;
  description: string;
  suggestedFix: string;
  severity: "high" | "medium" | "low";
  htmlUrl: string;
  repoOwner: string;
  repoName: string;
}

interface GitHubPR {
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
}

interface AgentActivity {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksFailed: number;
  avgDuration: number;
  lastActivity: string;
  status: "active" | "idle" | "error";
}

interface ProjectEvent {
  id: string;
  type: "commit" | "agent_run" | "error" | "warning" | "info";
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface DashboardStats {
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
}

interface AlertItem {
  severity: "warning" | "critical";
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  suggestedAssignee: string;
}

interface RetryTask {
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
}

interface DashboardData {
  timestamp: string;
  agents: AgentActivity[];
  events: ProjectEvent[];
  stats: DashboardStats;
  alerts: AlertItem[];
}

// ── API Clients ──
async function fetchPaperclipAPI(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${PAPERCLIP_API}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchGitHubAPI(endpoint: string, options: RequestInit = {}, owner?: string, repo?: string) {
  const o = owner || GITHUB_OWNER;
  const r = repo || GITHUB_REPO;
  const response = await fetch(`https://api.github.com/repos/${o}/${r}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Paperclip-Intelligence-Dashboard",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ── GitHub PR Tracking ──
async function fetchGitHubPRsForRepo(ctx: PluginContext, owner: string, repo: string): Promise<GitHubPR[]> {
  if (!GITHUB_TOKEN) return [];

  try {
    const prs = await fetchGitHubAPI("/pulls?state=open&per_page=50", {}, owner, repo) as Array<{
      number: number;
      title: string;
      state: string;
      user: { login: string };
      created_at: string;
      updated_at: string;
      html_url: string;
      draft: boolean;
      mergeable: boolean | null;
    }>;

    // Return basic PR info without extra API calls (avoid timeout)
    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      htmlUrl: pr.html_url,
      draft: pr.draft,
      mergeable: pr.mergeable,
      checksStatus: "unknown" as GitHubPR["checksStatus"],
      reviewStatus: "pending" as GitHubPR["reviewStatus"],
      repoOwner: owner,
      repoName: repo,
    }));
  } catch (err) {
    ctx.logger.warn(`GitHub PR tracking error for ${owner}/${repo}: ${err}`);
    return [];
  }
}

async function fetchGitHubPRs(ctx: PluginContext): Promise<GitHubPR[]> {
  if (!GITHUB_TOKEN) {
    ctx.logger.warn("GITHUB_TOKEN not set, skipping GitHub PR tracking");
    return [];
  }

  const allPRs: GitHubPR[] = [];
  for (const project of PROJECTS) {
    const [owner, repo] = project.repo.split("/");
    const prs = await fetchGitHubPRsForRepo(ctx, owner, repo);
    allPRs.push(...prs);
  }

  ctx.logger.info(`Tracked ${allPRs.length} total open PRs across all projects`);
  return allPRs;
}

// ── GitHub Failure Detection ──
async function fetchGitHubFailuresForRepo(ctx: PluginContext, owner: string, repo: string): Promise<GitHubFailure[]> {
  if (!GITHUB_TOKEN) return [];

  try {
    const issues = await fetchGitHubAPI("/issues?state=open&per_page=50", {}, owner, repo) as Array<{
      number: number;
      title: string;
      body: string | null;
      labels: Array<{ name: string }>;
      html_url: string;
      updated_at: string;
      pull_request?: unknown;
    }>;

    const failures: GitHubFailure[] = [];
    const now = new Date();

    for (const issue of issues) {
      const daysSinceUpdate = Math.floor((now.getTime() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      const labels = issue.labels.map(l => l.name.toLowerCase());

      let type: GitHubFailure["type"] = "test_failed";
      let severity: "high" | "medium" | "low" = "medium";
      let suggestedFix = "1. Review the issue description\n2. Determine if action is needed\n3. Assign to appropriate team member\n4. Update status as work progresses\n5. Close when resolved";

      if (labels.includes("bug") || labels.includes("critical")) {
        type = "test_failed";
        severity = "high";
        suggestedFix = "1. Read the bug description carefully\n2. Reproduce the issue locally\n3. Write a failing test that captures the bug\n4. Fix the code and verify the test passes\n5. Close the issue with a reference to the fix";
      } else if (labels.includes("paperclip-sync")) {
        type = "stale";
        severity = "low";
        suggestedFix = "1. Review the synced issue from Paperclip\n2. Check if it's still relevant\n3. Update or close if no longer needed\n4. Sync status back to Paperclip if changed";
      } else if (daysSinceUpdate > 7) {
        type = "stale";
        severity = "low";
        suggestedFix = "1. Review the stale issue\n2. Update with current status\n3. Close if no longer relevant\n4. Reassign if needed";
      }

      failures.push({
        type,
        issueNumber: issue.number,
        title: issue.title,
        description: `${labels.length > 0 ? `[${labels.join(", ")}] ` : ""}${issue.body?.substring(0, 100) || "No description"}`,
        suggestedFix,
        severity,
        htmlUrl: issue.html_url,
        repoOwner: owner,
        repoName: repo,
      });
    }

    return failures;
  } catch (err) {
    ctx.logger.warn(`GitHub failure detection error for ${owner}/${repo}: ${err}`);
    return [];
  }
}

async function fetchGitHubFailures(ctx: PluginContext): Promise<GitHubFailure[]> {
  if (!GITHUB_TOKEN) {
    ctx.logger.warn("GITHUB_TOKEN not set, skipping GitHub failure detection");
    return [];
  }

  const allFailures: GitHubFailure[] = [];
  for (const project of PROJECTS) {
    const [owner, repo] = project.repo.split("/");
    const failures = await fetchGitHubFailuresForRepo(ctx, owner, repo);
    allFailures.push(...failures);
  }

  ctx.logger.info(`Detected ${allFailures.length} total GitHub failures across all projects`);
  return allFailures;
}

// ── Real Data Fetchers ──
async function fetchAgents(companyId: string): Promise<AgentActivity[]> {
  const agents = await fetchPaperclipAPI(`/companies/${companyId}/agents`) as Array<{
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt?: string;
    pauseReason?: string | null;
  }>;

  return agents.map(agent => {
    let mappedStatus: "active" | "idle" | "error" = "idle";
    if (agent.status === "running" || agent.status === "active") mappedStatus = "active";
    else if (agent.status === "error" || agent.status === "paused") mappedStatus = "error";

    return {
      agentId: agent.id,
      agentName: agent.name,
      tasksCompleted: 0,
      tasksFailed: agent.status === "error" || agent.status === "paused" ? 1 : 0,
      avgDuration: 0,
      lastActivity: agent.lastHeartbeatAt || new Date().toISOString(),
      status: mappedStatus,
    };
  });
}

async function fetchDashboardStats(companyId: string): Promise<DashboardStats> {
  const issues = await fetchPaperclipAPI(`/companies/${companyId}/issues?limit=100`) as Array<{ status: string }>;

  const backlogCount = issues.filter(i => i.status === "backlog").length;
  const doneCount = issues.filter(i => i.status === "done").length;
  const inProgressCount = issues.filter(i => i.status === "in_progress").length;
  const blockedCount = issues.filter(i => i.status === "blocked").length;

  const agents = await fetchPaperclipAPI(`/companies/${companyId}/agents`) as Array<{ status: string }>;

  const activeAgentCount = agents.filter(a => a.status === "running").length;
  const pausedAgentCount = agents.filter(a => a.status === "paused").length;
  const errorAgentCount = agents.filter(a => a.status === "error").length;
  const idleAgentCount = agents.filter(a => a.status === "idle").length;

  return {
    totalAgents: agents.length,
    activeAgents: activeAgentCount,
    errorAgents: errorAgentCount,
    idleAgents: idleAgentCount || pausedAgentCount,
    totalTasks: issues.length,
    completedTasks: doneCount,
    failedTasks: blockedCount,
    openIssues: backlogCount,
    inProgressIssues: inProgressCount,
    blockedIssues: blockedCount,
    doneIssues: doneCount,
  };
}

async function fetchActivity(companyId: string): Promise<ProjectEvent[]> {
  const activities = await fetchPaperclipAPI(`/companies/${companyId}/activity?limit=20`) as Array<{
    id: string;
    action: string;
    actorType: string;
    actorId: string;
    createdAt: string;
    details?: Record<string, unknown>;
  }>;

  return activities.map(activity => {
    let type: ProjectEvent["type"] = "info";
    if (activity.action.includes("error") || activity.action.includes("failed")) type = "error";
    else if (activity.action.includes("warning")) type = "warning";
    else if (activity.action.includes("run") || activity.action.includes("execute")) type = "agent_run";

    return {
      id: activity.id,
      type,
      message: `${activity.actorType}: ${activity.action}`,
      timestamp: activity.createdAt,
      metadata: activity.details,
    };
  });
}

// ── Generate Dashboard Data ──
async function generateDashboardData(ctx: PluginContext, companyId?: string): Promise<DashboardData> {
  const effectiveCompanyId = companyId || ctx.company?.id || FALLBACK_COMPANY_ID;

  const [agents, stats, events] = await Promise.all([
    fetchAgents(effectiveCompanyId),
    fetchDashboardStats(effectiveCompanyId),
    fetchActivity(effectiveCompanyId),
  ]);

  const alerts: DashboardData["alerts"] = [];

  const errorAgents = agents.filter(a => a.status === "error");
  for (const agent of errorAgents) {
    alerts.push({
      severity: "critical",
      metric: `agent_${agent.agentName}`,
      message: `${agent.agentName} is in error state`,
      currentValue: 1,
      threshold: 0,
      suggestedAssignee: "Board",
    });
  }

  if (stats.failedTasks > 0) {
    alerts.push({
      severity: stats.failedTasks > 5 ? "critical" : "warning",
      metric: "failed_tasks",
      message: `${stats.failedTasks} blocked tasks`,
      currentValue: stats.failedTasks,
      threshold: 3,
      suggestedAssignee: "CTO",
    });
  }

  if (stats.openIssues > 10) {
    alerts.push({
      severity: "warning",
      metric: "open_issues",
      message: `${stats.openIssues} open issues`,
      currentValue: stats.openIssues,
      threshold: 10,
      suggestedAssignee: "CEO",
    });
  }

  return {
    timestamp: new Date().toISOString(),
    agents,
    events,
    stats,
    alerts,
  };
}

// ── Failed Tasks Detection ──
const failedTasksMap = new Map<string, RetryTask>();

async function detectFailedTasks(ctx: PluginContext, companyId?: string): Promise<RetryTask[]> {
  const effectiveCompanyId = companyId || ctx.company?.id || FALLBACK_COMPANY_ID;

  try {
    const agents = await fetchPaperclipAPI(`/companies/${effectiveCompanyId}/agents`) as Array<{
      id: string;
      name: string;
      status: string;
      pauseReason?: string | null;
    }>;

    failedTasksMap.clear();

    for (const agent of agents) {
      if (agent.status === "error" || agent.status === "paused") {
        const taskId = `task-${agent.id}`;
        failedTasksMap.set(taskId, {
          id: taskId,
          agentId: agent.id,
          agentName: agent.name,
          taskId,
          taskName: `${agent.name} Task`,
          error: agent.pauseReason || "Agent encountered an error",
          failedAt: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 3,
          status: "failed",
        });
      }
    }

    return Array.from(failedTasksMap.values());
  } catch (err) {
    ctx.logger.warn(`Failed to detect failed tasks: ${err}`);
    return [];
  }
}

// ── Plugin Definition ──
const intelligenceDashboardPlugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.logger.info("Intelligence Dashboard plugin setup");

    // Register data handler for GitHub failures
    ctx.data.register("github-failures", async () => {
      const failures = await fetchGitHubFailures(ctx);
      return { success: true, failures };
    });

    // Register data handler for GitHub PRs
    ctx.data.register("github-prs", async () => {
      const prs = await fetchGitHubPRs(ctx);
      return { success: true, prs };
    });

    // Register data handler for dashboard data
    ctx.data.register("dashboard", async (params: Record<string, unknown>) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
      const data = await generateDashboardData(ctx, companyId);
      return { success: true, data };
    });

    // Register data handler for failed tasks
    ctx.data.register("failed-tasks", async (params: Record<string, unknown>) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
      const tasks = await detectFailedTasks(ctx, companyId);
      return { success: true, tasks };
    });

    // Register data handler for active project
    ctx.data.register("active-project", async () => {
      return {
        success: true,
        activeProject: PROJECTS.length > 0 ? {
          name: PROJECTS[0].name,
          repo: PROJECTS[0].repo,
          score: 0,
          lastActivity: Date.now(),
          currentBranch: "",
          timeSpent: 0,
        } : null,
        allProjects: PROJECTS.map(p => ({
          name: p.name,
          repo: p.repo,
          score: 0,
          lastActivity: Date.now(),
          lastFileEdit: 0,
          lastCommit: 0,
          currentBranch: "",
          timeSpent: 0,
          recentEdits: 0,
          recentCommits: 0,
        })),
      };
    });

    // Register action handler for retry
    ctx.actions.register("retry-task", async (params: Record<string, unknown>) => {
      const taskId = typeof params.taskId === "string" ? params.taskId : "";
      const task = failedTasksMap.get(taskId);
      if (!task) {
        return { success: false, error: "Task not found" };
      }

      await fetchPaperclipAPI(`/agents/${task.agentId}/resume`, { method: "POST" });
      failedTasksMap.delete(taskId);
      ctx.logger.info(`Retried task ${taskId} for agent ${task.agentName}`);
      return { success: true, message: `Resumed ${task.agentName}` };
    });

    // Register action handler for skip
    ctx.actions.register("skip-task", async (params: Record<string, unknown>) => {
      const taskId = typeof params.taskId === "string" ? params.taskId : "";
      const task = failedTasksMap.get(taskId);
      if (!task) {
        return { success: false, error: "Task not found" };
      }
      failedTasksMap.delete(taskId);
      ctx.logger.info(`Skipped task ${taskId}`);
      return { success: true, message: "Task skipped" };
    });

    // Register action handler for refresh
    ctx.actions.register("refresh", async (params: Record<string, unknown>) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
      failedTasksMap.clear();
      await detectFailedTasks(ctx, companyId);
      const data = await generateDashboardData(ctx, companyId);
      return { success: true, data };
    });

    // Register action handler for test notification
    ctx.actions.register("test-notification", async () => {
      const companyId = FALLBACK_COMPANY_ID;
      const issue = await fetchPaperclipAPI(`/companies/${companyId}/issues`, {
        method: "POST",
        body: JSON.stringify({
          title: "Test Alert from Intelligence Dashboard",
          description: "This is a test alert triggered from the Intelligence Dashboard.",
          status: "backlog",
          priority: "medium",
        }),
      });
      return { success: true, issueId: issue.id };
    });

    ctx.logger.info("Intelligence Dashboard ready");
  },

  async onHealth() {
    return { status: "ok", message: `${PLUGIN_NAME} ready` };
  },
});

export default intelligenceDashboardPlugin;
runWorker(intelligenceDashboardPlugin, import.meta.url);
