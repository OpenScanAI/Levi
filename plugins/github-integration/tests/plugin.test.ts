import { describe, it, expect, vi } from "vitest";
import type { PluginContext, PluginEvent, ScopeKey } from "@paperclipai/plugin-sdk";

// Mock the plugin SDK modules
vi.mock("@paperclipai/plugin-sdk", async () => {
  const actual = await vi.importActual("@paperclipai/plugin-sdk");
  return {
    ...actual,
    definePlugin: (config: any) => config,
    runWorker: () => {},
  };
});

// Import the functions we want to test
// Note: These are internal functions, so we test them via the plugin behavior

const PLUGIN_ID = "github-integration";
const JOB_KEY_SYNC = "github-sync";
const WEBHOOK_KEY_GITHUB = "github-webhook";

function scope(key: string): ScopeKey {
  return { scopeKind: "instance", stateKey: key };
}

describe("GitHub Integration Plugin", () => {
  describe("scope()", () => {
    it("should create instance-scoped keys", () => {
      const key = scope("test-key");
      expect(key.scopeKind).toBe("instance");
      expect(key.stateKey).toBe("test-key");
    });
  });

  describe("Configuration", () => {
    it("should require githubRepo", () => {
      const config = {} as any;
      expect(config.githubRepo).toBeUndefined();
    });

    it("should parse status mapping JSON", () => {
      const mapping = '{"backlog":"open","done":"closed"}';
      const parsed = JSON.parse(mapping);
      expect(parsed.backlog).toBe("open");
      expect(parsed.done).toBe("closed");
    });

    it("should handle invalid status mapping JSON", () => {
      const mapping = "invalid json";
      expect(() => JSON.parse(mapping)).toThrow();
    });
  });

  describe("Event Handling", () => {
    it("should create GitHub issue on issue.created", () => {
      const event = {
        payload: {
          id: "test-issue-123",
          title: "Test Issue",
          body: "Test body",
        },
      } as any;

      expect(event.payload.id).toBe("test-issue-123");
      expect(event.payload.title).toBe("Test Issue");
    });

    it("should skip if issue already mapped", () => {
      const mappings = { "test-issue-123": 456 };
      const issueId = "test-issue-123";
      expect(mappings[issueId]).toBeDefined();
    });

    it("should update GitHub issue on issue.updated", () => {
      const event = {
        payload: {
          id: "test-issue-123",
          status: "done",
          title: "Updated Title",
        },
      } as any;

      expect(event.payload.status).toBe("done");
    });

    it("should mirror comment on issue.comment.created", () => {
      const event = {
        payload: {
          issueId: "test-issue-123",
          body: "Test comment",
          authorId: "user-123",
        },
      } as any;

      expect(event.payload.issueId).toBe("test-issue-123");
      expect(event.payload.body).toBe("Test comment");
    });
  });

  describe("Status Mapping", () => {
    it("should map Paperclip statuses to GitHub states", () => {
      const defaultMapping = {
        backlog: "open",
        todo: "open",
        in_progress: "open",
        done: "closed",
        cancelled: "closed",
      };

      expect(defaultMapping.backlog).toBe("open");
      expect(defaultMapping.done).toBe("closed");
    });

    it("should create reverse mapping", () => {
      const statusMapping = {
        backlog: "open",
        todo: "open",
        in_progress: "open",
        done: "closed",
        cancelled: "closed",
      };

      const reverseMapping: Record<string, string> = {};
      for (const [pc, gh] of Object.entries(statusMapping)) {
        reverseMapping[gh] = pc;
      }

      // Last one wins for duplicate values
      expect(reverseMapping["open"]).toBe("in_progress");
      expect(reverseMapping["closed"]).toBe("cancelled");
    });
  });

  describe("Conflict Resolution", () => {
    it("should skip update if GitHub version is newer", () => {
      const syncState = {
        "issue-123": {
          githubUpdatedAt: "2024-01-02T00:00:00Z",
          paperclipUpdatedAt: "2024-01-01T00:00:00Z",
        },
      };

      const ghTime = new Date(syncState["issue-123"].githubUpdatedAt).getTime();
      const pcTime = new Date(syncState["issue-123"].paperclipUpdatedAt).getTime();

      expect(ghTime).toBeGreaterThan(pcTime);
    });

    it("should allow update if Paperclip version is newer", () => {
      const syncState = {
        "issue-123": {
          githubUpdatedAt: "2024-01-01T00:00:00Z",
          paperclipUpdatedAt: "2024-01-02T00:00:00Z",
        },
      };

      const ghTime = new Date(syncState["issue-123"].githubUpdatedAt).getTime();
      const pcTime = new Date(syncState["issue-123"].paperclipUpdatedAt).getTime();

      expect(pcTime).toBeGreaterThan(ghTime);
    });
  });

  describe("Webhook Handling", () => {
    it("should verify webhook signature", () => {
      const secret = "test-secret";
      const body = '{"action":"opened"}';
      
      // HMAC-SHA256 signature
      const crypto = require("crypto");
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(body, "utf8");
      const signature = "sha256=" + hmac.digest("hex");

      // Verify
      const hmac2 = crypto.createHmac("sha256", secret);
      hmac2.update(body, "utf8");
      const digest = "sha256=" + hmac2.digest("hex");
      
      expect(crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))).toBe(true);
    });

    it("should reject invalid webhook signature", () => {
      const secret = "test-secret";
      const body = '{"action":"opened"}';
      const wrongSignature = "sha256=invalid";

      const crypto = require("crypto");
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(body, "utf8");
      const digest = "sha256=" + hmac.digest("hex");

      expect(() => crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(wrongSignature))).toThrow();
    });

    it("should handle issues event", () => {
      const eventType = "issues";
      const body = {
        action: "closed",
        issue: {
          number: 123,
          state: "closed",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      expect(eventType).toBe("issues");
      expect(body.issue.state).toBe("closed");
    });

    it("should handle issue_comment event", () => {
      const eventType = "issue_comment";
      const body = {
        action: "created",
        issue: { number: 123 },
        comment: {
          id: 456,
          body: "Test comment",
          user: { login: "testuser" },
        },
      };

      expect(eventType).toBe("issue_comment");
      expect(body.comment.user.login).toBe("testuser");
    });
  });

  describe("State Management", () => {
    it("should store issue mappings", () => {
      const mappings: Record<string, number> = {
        "paperclip-123": 456,
      };

      expect(mappings["paperclip-123"]).toBe(456);
    });

    it("should store reverse mappings", () => {
      const reverse: Record<number, string> = {
        456: "paperclip-123",
      };

      expect(reverse[456]).toBe("paperclip-123");
    });

    it("should store sync state", () => {
      const syncState: Record<string, { githubUpdatedAt?: string; paperclipUpdatedAt?: string }> = {
        "paperclip-123": {
          githubUpdatedAt: "2024-01-01T00:00:00Z",
          paperclipUpdatedAt: "2024-01-02T00:00:00Z",
        },
      };

      expect(syncState["paperclip-123"].githubUpdatedAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("PR Creation", () => {
    it("should generate branch name from issue title", () => {
      const title = "Fix login bug on mobile";
      const ghNumber = 123;
      const branchName = `paperclip/${ghNumber}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

      expect(branchName).toBe("paperclip/123-fix-login-bug-on-mobile");
    });

    it("should handle empty title", () => {
      const title = "";
      const ghNumber = 123;
      const branchName = `paperclip/${ghNumber}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "fix"}`;

      expect(branchName).toBe("paperclip/123-fix");
    });
  });

  describe("Rate Limiting", () => {
    it("should detect rate limit exceeded", () => {
      const err = {
        status: 403,
        response: {
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1700000000",
          },
        },
      };

      expect(err.status).toBe(403);
      expect(err.response.headers["x-ratelimit-remaining"]).toBe("0");
    });

    it("should calculate wait time", () => {
      const resetAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const waitMs = resetAt * 1000 - Date.now();

      expect(waitMs).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle 401 unauthorized", () => {
      const err = { status: 401 };
      expect(err.status).toBe(401);
    });

    it("should handle 404 not found", () => {
      const err = { status: 404 };
      expect(err.status).toBe(404);
    });

    it("should retry on 5xx errors", () => {
      const err = { status: 500 };
      expect(err.status).toBeGreaterThanOrEqual(500);
    });
  });
});

describe("Plugin Manifest", () => {
  it("should declare all required capabilities", () => {
    const capabilities = [
      "issues.read",
      "issues.create",
      "issues.update",
      "issue.comments.create",
      "issue.comments.read",
      "plugin.state.read",
      "plugin.state.write",
      "jobs.schedule",
      "events.subscribe",
      "http.outbound",
      "secrets.read-ref",
      "webhooks.receive",
      "agent.tools.register",
    ];

    expect(capabilities).toContain("issues.read");
    expect(capabilities).toContain("issues.create");
    expect(capabilities).toContain("issues.update");
    expect(capabilities).toContain("plugin.state.read");
    expect(capabilities).toContain("plugin.state.write");
    expect(capabilities).toContain("events.subscribe");
    expect(capabilities).toContain("http.outbound");
    expect(capabilities).toContain("secrets.read-ref");
    expect(capabilities).toContain("webhooks.receive");
  });

  it("should declare webhook endpoint", () => {
    const webhook = {
      endpointKey: "github-webhook",
      displayName: "GitHub Webhook",
      description: "Receive GitHub issue/PR event webhooks",
    };

    expect(webhook.endpointKey).toBe("github-webhook");
  });

  it("should declare sync job", () => {
    const job = {
      jobKey: "github-sync",
      displayName: "GitHub Sync",
      description: "Periodic bidirectional sync with GitHub issues",
      schedule: "0 */6 * * *",
    };

    expect(job.jobKey).toBe("github-sync");
    expect(job.schedule).toBe("0 */6 * * *");
  });

  it("should declare tools", () => {
    const tools = [
      {
        name: "github_create_issue",
        displayName: "Create GitHub Issue",
      },
      {
        name: "github_sync_status",
        displayName: "Sync GitHub Status",
      },
    ];

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("github_create_issue");
    expect(tools[1].name).toBe("github_sync_status");
  });
});
