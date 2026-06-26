import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { Octokit } from "@octokit/rest";
import type { PluginContext, PluginEvent, ScopeKey } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "github-integration";
const JOB_KEY_SYNC = "github-sync";
const WEBHOOK_KEY_GITHUB = "github-webhook";
const TOOL_NAME_CREATE_ISSUE = "github_create_issue";
const TOOL_NAME_SYNC_STATUS = "github_sync_status";

interface GitHubConfig {
  githubRepo: string;
  githubApiBase?: string;
  statusMapping?: string;
  enablePrOnDone?: boolean;
  githubTokenSecretRef?: string;
  githubToken?: string;
  githubWebhookSecretRef?: string;
  defaultCompanyId?: string;
}

// Module-level state shared between setup and webhook handlers
let pluginCtx: PluginContext | null = null;
let pluginOctokit: Octokit | null = null;
let pluginOwner: string | null = null;
let pluginRepo: string | null = null;
let pluginStatusMapping: Record<string, string> = {};
let pluginReverseStatusMapping: Record<string, string> = {};
let pluginConfig: GitHubConfig | null = null;

function scope(key: string): ScopeKey {
  return { scopeKind: "instance", stateKey: key };
}

async function verifyWebhookSignature(rawBody: string, signature: string | string[] | undefined, secret: string): Promise<boolean> {
  if (!signature) return false;
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) return false;

  const crypto = await import("crypto");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const digest = "sha256=" + hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
}

function getStatusMapping(config: GitHubConfig): Record<string, string> {
  const defaultMapping: Record<string, string> = {
    backlog: "open",
    todo: "open",
    in_progress: "open",
    done: "closed",
    cancelled: "closed",
  };
  if (!config.statusMapping) return defaultMapping;
  try {
    const custom = JSON.parse(config.statusMapping);
    return { ...defaultMapping, ...custom };
  } catch {
    return defaultMapping;
  }
}

async function githubApiCall<T>(ctx: PluginContext, operation: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (err: any) {
      if (err.status === 401) {
        ctx.logger.error("GitHub token invalid or expired");
        throw err;
      }
      if (err.status === 403 && err.response?.headers?.["x-ratelimit-remaining"] === "0") {
        const resetAt = err.response.headers["x-ratelimit-reset"];
        const waitMs = resetAt ? parseInt(resetAt) * 1000 - Date.now() : 60000;
        ctx.logger.warn(`Rate limit exceeded. Waiting ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 300000)));
        attempt++;
        continue;
      }
      if (err.status >= 500 && attempt < maxRetries - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        ctx.logger.warn(`GitHub error ${err.status}, retrying in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        attempt++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    const configRaw = await ctx.config.get();
    const config = configRaw as unknown as GitHubConfig;

    // Validate config but don't throw — let plugin start in degraded mode
    if (!config.githubRepo) {
      ctx.logger.warn("githubRepo config not set. Plugin running in degraded mode.");
      return;
    }

    const [owner, repo] = config.githubRepo.split("/");
    if (!owner || !repo) {
      ctx.logger.warn("githubRepo must be in owner/repo format. Plugin running in degraded mode.");
      return;
    }

    let token: string;
    const tokenRef = config.githubTokenSecretRef;
    const plainToken = config.githubToken;

    if (plainToken && typeof plainToken === "string" && plainToken.length > 0) {
      token = plainToken;
      ctx.logger.info("Using plain githubToken from config (fallback mode).");
    } else if (tokenRef && typeof tokenRef === "string" && tokenRef.length > 0) {
      try {
        token = await ctx.secrets.resolve(tokenRef);
      } catch (err: any) {
        ctx.logger.warn("Failed to resolve GitHub token secret:", err.message);
        ctx.logger.warn("Plugin running in degraded mode.");
        return;
      }
    } else {
      ctx.logger.warn("No githubToken or githubTokenSecretRef configured. Plugin running in degraded mode.");
      return;
    }

    const apiBase = config.githubApiBase || "https://api.github.com";
    const octokit = new Octokit({ auth: token, baseUrl: apiBase });
    const statusMapping = getStatusMapping(config);
    const reverseStatusMapping: Record<string, string> = {};
    for (const [pc, gh] of Object.entries(statusMapping)) {
      reverseStatusMapping[gh] = pc;
    }

    // Store in module-level state for webhook handler access
    pluginCtx = ctx;
    pluginOctokit = octokit;
    pluginOwner = owner;
    pluginRepo = repo;
    pluginStatusMapping = statusMapping;
    pluginReverseStatusMapping = reverseStatusMapping;
    pluginConfig = config;

    ctx.logger.info(`GitHub plugin initialized for ${owner}/${repo}`);

    // ─── Issue created → GitHub issue created ─────────────────────────
    ctx.events.on("issue.created", async (event: PluginEvent) => {
      try {
        const payload = event.payload as any;
        const issueId = payload.id;
        if (!issueId) return;

        const mappings = (await ctx.state.get(scope("issue-mappings"))) as Record<string, number> | null;
        if (mappings?.[issueId]) return;

        const { data: ghIssue } = await githubApiCall(ctx, () =>
          octokit.rest.issues.create({
            owner,
            repo,
            title: payload.title || "Untitled",
            body: payload.body || "",
          })
        );

        const newMappings = { ...(mappings || {}), [issueId]: ghIssue.number };
        await ctx.state.set(scope("issue-mappings"), newMappings);

        const reverse = (await ctx.state.get(scope("reverse-mappings"))) as Record<number, string> | null;
        const newReverse = { ...(reverse || {}), [ghIssue.number]: issueId };
        await ctx.state.set(scope("reverse-mappings"), newReverse);

        ctx.logger.info(`Created GitHub issue #${ghIssue.number} for Paperclip issue ${issueId}`);
      } catch (err: any) {
        ctx.logger.error("Failed to create GitHub issue:", err.message);
      }
    });

    // ─── Issue updated → GitHub issue updated + PR on done ─────────────
    ctx.events.on("issue.updated", async (event: PluginEvent) => {
      try {
        const payload = event.payload as any;
        const issueId = payload.id;
        if (!issueId) return;

        const mappings = (await ctx.state.get(scope("issue-mappings"))) as Record<string, number> | null;
        const ghNumber = mappings?.[issueId];
        if (!ghNumber) return;

        // Conflict resolution: check if GitHub was updated more recently
        const syncState = (await ctx.state.get(scope("sync-state"))) as Record<string, { githubUpdatedAt?: string; paperclipUpdatedAt?: string }> | null;
        const issueSyncState = syncState?.[issueId];
        const paperclipUpdatedAt = payload.updatedAt || new Date().toISOString();
        
        if (issueSyncState?.githubUpdatedAt) {
          const ghTime = new Date(issueSyncState.githubUpdatedAt).getTime();
          const pcTime = new Date(paperclipUpdatedAt).getTime();
          if (ghTime > pcTime) {
            ctx.logger.info(`Skipping Paperclip → GitHub update for ${issueId}: GitHub version is newer`);
            return;
          }
        }

        const updateData: any = {
          owner,
          repo,
          issue_number: ghNumber,
        };
        if (payload.title !== undefined) updateData.title = payload.title;
        if (payload.body !== undefined) updateData.body = payload.body;
        if (payload.status !== undefined) {
          updateData.state = statusMapping[payload.status] || "open";
        }

        await githubApiCall(ctx, () => octokit.rest.issues.update(updateData));
        
        // Update sync state with Paperclip timestamp
        const newSyncState = { ...(syncState || {}), [issueId]: { ...issueSyncState, paperclipUpdatedAt } };
        await ctx.state.set(scope("sync-state"), newSyncState);
        
        ctx.logger.info(`Updated GitHub issue #${ghNumber}`);

        // ─── Create PR when issue marked done ─────────────────────────
        if (config.enablePrOnDone && payload.status === "done") {
          try {
            const branchName = `paperclip/${ghNumber}-${payload.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "fix"}`;
            
            // Get default branch
            const { data: repoData } = await githubApiCall(ctx, () =>
              octokit.rest.repos.get({ owner, repo })
            );
            const defaultBranch = repoData.default_branch;

            // Get default branch SHA
            const { data: refData } = await githubApiCall(ctx, () =>
              octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` })
            );

            // Create branch
            await githubApiCall(ctx, () =>
              octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: refData.object.sha,
              })
            );

            // Create PR
            const { data: pr } = await githubApiCall(ctx, () =>
              octokit.rest.pulls.create({
                owner,
                repo,
                title: payload.title || `Closes #${ghNumber}`,
                body: `Closes #${ghNumber}\n\nPaperclip issue: ${issueId}`,
                head: branchName,
                base: defaultBranch,
              })
            );

            ctx.logger.info(`Created PR #${pr.number} for done issue #${ghNumber}`);
          } catch (err: any) {
            ctx.logger.error("Failed to create PR for done issue:", err.message);
          }
        }
      } catch (err: any) {
        ctx.logger.error("Failed to update GitHub issue:", err.message);
      }
    });

    // ─── Comment created → GitHub comment mirrored ────────────────────
    ctx.events.on("issue.comment.created", async (event: PluginEvent) => {
      try {
        const payload = event.payload as any;
        const issueId = payload.issueId;
        if (!issueId) return;

        const mappings = (await ctx.state.get(scope("issue-mappings"))) as Record<string, number> | null;
        const ghNumber = mappings?.[issueId];
        if (!ghNumber) return;

        const body = payload.authorId
          ? `[via Paperclip] ${payload.body || ""}`
          : payload.body || "";

        await githubApiCall(ctx, () =>
          octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: ghNumber,
            body,
          })
        );

        ctx.logger.info(`Mirrored comment to GitHub issue #${ghNumber}`);
      } catch (err: any) {
        ctx.logger.error("Failed to mirror comment:", err.message);
      }
    });

    // ─── Periodic sync job ───────────────────────────────────────────
    ctx.jobs.register(JOB_KEY_SYNC, async () => {
      try {
        const lastSyncRaw = await ctx.state.get(scope("last-sync"));
        const lastSync = lastSyncRaw ? new Date(lastSyncRaw as string) : new Date(0);
        const reverse = (await ctx.state.get(scope("reverse-mappings"))) as Record<number, string> | null;
        const companyId = config.defaultCompanyId;

        if (!companyId) {
          ctx.logger.warn("No defaultCompanyId configured, skipping sync job");
          return;
        }

        const { data: ghIssues } = await githubApiCall(ctx, () =>
          octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: "all",
            since: lastSync.toISOString(),
            per_page: 100,
          })
        );

        let updatedCount = 0;
        for (const ghIssue of ghIssues) {
          const paperclipId = reverse?.[ghIssue.number];
          if (!paperclipId) continue;

          const newStatus = reverseStatusMapping[ghIssue.state] || "in_progress";
          
          try {
            // Conflict resolution: check if Paperclip was updated more recently
            const syncState = (await ctx.state.get(scope("sync-state"))) as Record<string, { githubUpdatedAt?: string; paperclipUpdatedAt?: string }> | null;
            const issueSyncState = syncState?.[paperclipId];
            const githubUpdatedAt = ghIssue.updated_at;
            
            if (issueSyncState?.paperclipUpdatedAt && githubUpdatedAt) {
              const pcTime = new Date(issueSyncState.paperclipUpdatedAt).getTime();
              const ghTime = new Date(githubUpdatedAt).getTime();
              if (pcTime > ghTime) {
                ctx.logger.info(`Skipping sync for ${paperclipId}: Paperclip version is newer`);
                continue;
              }
            }
            
            await ctx.issues.update(
              paperclipId,
              { status: newStatus as any },
              companyId
            );
            
            // Update sync state with GitHub timestamp
            const newSyncState = { ...(syncState || {}), [paperclipId]: { ...issueSyncState, githubUpdatedAt } };
            await ctx.state.set(scope("sync-state"), newSyncState);
            
            updatedCount++;
            ctx.logger.info(`Sync: GitHub #${ghIssue.number} → Paperclip ${paperclipId} status=${newStatus}`);
          } catch (err: any) {
            ctx.logger.error(`Failed to update Paperclip issue ${paperclipId}:`, err.message);
          }
        }

        await ctx.state.set(scope("last-sync"), new Date().toISOString());
        ctx.logger.info(`Bidirectional sync completed. ${ghIssues.length} issues checked, ${updatedCount} updated.`);
      } catch (err: any) {
        ctx.logger.error("Bidirectional sync failed:", err.message);
      }
    });

    // ─── Agent tools ───────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAME_CREATE_ISSUE,
      {
        displayName: "Create GitHub Issue",
        description: "Create a GitHub issue from an agent tool call",
        parametersSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            labels: { type: "array", items: { type: "string" } },
          },
          required: ["title"],
        },
      },
      async (params: unknown, _runCtx: any) => {
        const p = params as { title: string; body?: string; labels?: string[] };
        const { data: ghIssue } = await githubApiCall(ctx, () =>
          octokit.rest.issues.create({
            owner,
            repo,
            title: p.title,
            body: p.body || "",
            labels: p.labels || [],
          })
        );
        return {
          content: `Created GitHub issue #${ghIssue.number}: ${ghIssue.html_url}`,
          data: { githubIssueNumber: ghIssue.number, url: ghIssue.html_url },
        };
      }
    );

    ctx.tools.register(
      TOOL_NAME_SYNC_STATUS,
      {
        displayName: "Sync GitHub Status",
        description: "Manually trigger status sync for a specific issue",
        parametersSchema: {
          type: "object",
          properties: {
            paperclipIssueId: { type: "string" },
          },
          required: ["paperclipIssueId"],
        },
      },
      async (params: unknown, _runCtx: any) => {
        const p = params as { paperclipIssueId: string };
        const mappings = (await ctx.state.get(scope("issue-mappings"))) as Record<string, number> | null;
        const ghNumber = mappings?.[p.paperclipIssueId];
        if (!ghNumber) {
          return { error: "No GitHub mapping found for this issue" };
        }

        const { data: ghIssue } = await githubApiCall(ctx, () =>
          octokit.rest.issues.get({ owner, repo, issue_number: ghNumber })
        );

        return { content: `GitHub issue #${ghNumber} is ${ghIssue.state}`, data: { state: ghIssue.state, number: ghIssue.number } };
      }
    );
  },

  async onWebhook(input) {
    const ctx = pluginCtx;
    const octokit = pluginOctokit;
    const owner = pluginOwner;
    const repo = pluginRepo;
    const reverseStatusMapping = pluginReverseStatusMapping;
    const config = pluginConfig;

    if (!ctx || !octokit || !owner || !repo || !config) {
      console.warn("[github-integration] Webhook received but plugin not initialized");
      return;
    }

    ctx.logger.info(`Received webhook: ${input.endpointKey}`);
    
    if (input.endpointKey !== WEBHOOK_KEY_GITHUB) {
      ctx.logger.warn(`Unknown webhook endpoint: ${input.endpointKey}`);
      return;
    }

    // Verify webhook signature if configured
    const webhookSecretRef = config.githubWebhookSecretRef;
    if (webhookSecretRef && typeof webhookSecretRef === "string" && webhookSecretRef.length > 0) {
      try {
        const secret = await ctx.secrets.resolve(webhookSecretRef);
        const signature = input.headers["x-hub-signature-256"];
        const isValid = await verifyWebhookSignature(input.rawBody, signature, secret);
        if (!isValid) {
          ctx.logger.error("Webhook signature verification failed — possible spoofing attempt");
          return;
        }
        ctx.logger.info("Webhook signature verified");
      } catch (err: any) {
        ctx.logger.error("Failed to verify webhook signature:", err.message);
        return;
      }
    } else {
      ctx.logger.warn("No githubWebhookSecretRef configured, skipping signature verification");
    }

    const body = input.parsedBody as any;
    if (!body) {
      ctx.logger.warn("Webhook received with no parsed body");
      return;
    }

    const eventType = (input.headers["x-github-event"] as string) || body.action || "unknown";
    ctx.logger.info(`GitHub event: ${eventType}`);

    // Handle issue events from GitHub
    if (eventType === "issues" && body.issue) {
      const ghNumber = body.issue.number;
      const reverse = (await ctx.state.get(scope("reverse-mappings"))) as Record<number, string> | null;
      const paperclipId = reverse?.[ghNumber];
      
      if (!paperclipId) {
        ctx.logger.info(`No Paperclip mapping for GitHub issue #${ghNumber}`);
        return;
      }

      const newStatus = reverseStatusMapping[body.issue.state] || "in_progress";
      const companyId = config.defaultCompanyId;
      
      if (companyId) {
        try {
          // Conflict resolution: check if Paperclip was updated more recently
          const syncState = (await ctx.state.get(scope("sync-state"))) as Record<string, { githubUpdatedAt?: string; paperclipUpdatedAt?: string }> | null;
          const issueSyncState = syncState?.[paperclipId];
          const githubUpdatedAt = body.issue.updated_at;
          
          if (issueSyncState?.paperclipUpdatedAt && githubUpdatedAt) {
            const pcTime = new Date(issueSyncState.paperclipUpdatedAt).getTime();
            const ghTime = new Date(githubUpdatedAt).getTime();
            if (pcTime > ghTime) {
              ctx.logger.info(`Skipping GitHub → Paperclip update for ${paperclipId}: Paperclip version is newer`);
              return;
            }
          }
          
          await ctx.issues.update(
            paperclipId,
            { status: newStatus as any },
            companyId
          );
          
          // Update sync state with GitHub timestamp
          const newSyncState = { ...(syncState || {}), [paperclipId]: { ...issueSyncState, githubUpdatedAt } };
          await ctx.state.set(scope("sync-state"), newSyncState);
          
          ctx.logger.info(`GitHub issue #${ghNumber} → Paperclip ${paperclipId} status=${newStatus}`);
        } catch (err: any) {
          ctx.logger.error(`Failed to update Paperclip issue ${paperclipId} from webhook:`, err.message);
        }
      } else {
        ctx.logger.warn(`No defaultCompanyId, skipping Paperclip update for GitHub issue #${ghNumber}`);
      }
    }

    // Handle issue comments from GitHub
    if (eventType === "issue_comment" && body.comment && body.issue) {
      const ghNumber = body.issue.number;
      const reverse = (await ctx.state.get(scope("reverse-mappings"))) as Record<number, string> | null;
      const paperclipId = reverse?.[ghNumber];
      
      if (!paperclipId) {
        ctx.logger.info(`No Paperclip mapping for GitHub issue #${ghNumber}`);
        return;
      }

      const companyId = config.defaultCompanyId;
      if (companyId) {
        try {
          const author = body.comment.user?.login || "unknown";
          const commentBody = `[GitHub @${author}] ${body.comment.body || ""}`;
          await ctx.issues.createComment(
            paperclipId,
            commentBody,
            companyId
          );
          ctx.logger.info(`GitHub comment by @${author} on #${ghNumber} → Paperclip ${paperclipId}`);
        } catch (err: any) {
          ctx.logger.error(`Failed to create Paperclip comment from webhook:`, err.message);
        }
      }
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
