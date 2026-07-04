import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, PluginEvent, PluginHealthDiagnostics } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip.github-integration";

interface GitHubConfig {
  githubTokenRef: string;
  githubOwner: string;
  githubRepo: string;
  githubToken?: string; // Direct token for testing
}

interface GitHubIssueResponse {
  id: number;
  number: number;
  title: string;
  html_url: string;
}

async function getConfig(ctx: PluginContext): Promise<GitHubConfig> {
  const config = await ctx.config.get();
  return {
    githubTokenRef: "",
    githubOwner: String(config.githubOwner ?? ""),
    githubRepo: String(config.githubRepo ?? ""),
    githubToken: config.githubToken ? String(config.githubToken) : undefined,
  };
}

async function createGitHubIssue(
  ctx: PluginContext,
  config: GitHubConfig,
  title: string,
  description: string,
): Promise<GitHubIssueResponse> {
  let token: string;
  
  // Try direct token first (for testing), then fall back to secret reference
  if (config.githubToken) {
    token = config.githubToken;
    ctx.logger.info("Using direct GitHub token from config");
  } else if (config.githubTokenRef) {
    token = await ctx.secrets.resolve(config.githubTokenRef);
    ctx.logger.info("GitHub token resolved from secrets");
  } else {
    throw new Error("No GitHub token available. Set githubToken or githubTokenRef in config.");
  }
  
  const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/issues`;

  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Paperclip-GitHub-Integration/0.1.0",
    },
    body: JSON.stringify({
      title,
      body: description,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json() as GitHubIssueResponse;
  return data;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} plugin setup starting`);
    ctx.logger.info("DEBUG: setup() function entered");
    
    // Debug: Log all available context methods
    ctx.logger.info("DEBUG: Available ctx methods", {
      hasEvents: !!ctx.events,
      hasEventsOn: !!ctx.events?.on,
      hasConfig: !!ctx.config,
      hasSecrets: !!ctx.secrets,
      hasHttp: !!ctx.http,
      hasState: !!ctx.state,
      hasActivity: !!ctx.activity,
    });

    const config = await getConfig(ctx);
    ctx.logger.info("GitHub integration config loaded", {
      owner: config.githubOwner,
      repo: config.githubRepo,
      hasTokenRef: !!config.githubTokenRef,
      hasDirectToken: !!config.githubToken,
    });

    // Subscribe to issue.created events
    ctx.logger.info("DEBUG: About to call ctx.events.on('issue.created')");
    ctx.events.on("issue.created", async (event: PluginEvent) => {
      ctx.logger.info("Received issue.created event", { eventId: event.eventId });

      try {
        const payload = event.payload as {
          title?: string;
          description?: string;
          identifier?: string;
        } | null;

        if (!payload) {
          ctx.logger.warn("No payload in issue.created event");
          return;
        }

        // companyId is at the top level of PluginEvent, not in payload
        const companyId = event.companyId;
        const title = payload.title;
        const description = payload.description || "";

        if (!title) {
          ctx.logger.warn("Missing title in issue.created payload");
          return;
        }

        if (!companyId) {
          ctx.logger.warn("Missing companyId in issue.created event");
          return;
        }

        // Create GitHub issue
        const githubIssue = await createGitHubIssue(ctx, config, title, description ?? "");

        ctx.logger.info("GitHub issue created", {
          githubIssueNumber: githubIssue.number,
          githubUrl: githubIssue.html_url,
        });

        // Store sync state
        await ctx.state.set(
          {
            scopeKind: "company",
            scopeId: companyId,
            stateKey: `github-sync-${event.entityId}`,
          },
          {
            paperclipIssueId: event.entityId,
            githubIssueNumber: githubIssue.number,
            githubUrl: githubIssue.html_url,
            syncedAt: new Date().toISOString(),
          },
        );

        // Log activity
        await ctx.activity.log({
          companyId,
          message: `Created GitHub issue #${githubIssue.number} for Paperclip issue ${event.entityId}`,
          entityType: "issue",
          entityId: event.entityId,
          metadata: {
            githubIssueNumber: githubIssue.number,
            githubUrl: githubIssue.html_url,
          },
        });
      } catch (error) {
        ctx.logger.error("Failed to create GitHub issue", {
          error: error instanceof Error ? error.message : String(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.logger.info("DEBUG: events.on subscription registered");
    ctx.logger.info(`${PLUGIN_ID} plugin setup complete`);
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    return {
      status: "ok",
      message: "GitHub integration plugin ready",
    };
  },

  async onValidateConfig(config) {
    const errors: string[] = [];

    if (!config.githubTokenRef || typeof config.githubTokenRef !== "string") {
      errors.push("githubTokenRef is required and must be a string");
    }
    if (!config.githubOwner || typeof config.githubOwner !== "string") {
      errors.push("githubOwner is required and must be a string");
    }
    if (!config.githubRepo || typeof config.githubRepo !== "string") {
      errors.push("githubRepo is required and must be a string");
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings: [],
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
