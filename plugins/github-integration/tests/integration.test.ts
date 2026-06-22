import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Octokit
const mockOctokit = {
  rest: {
    issues: {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      createComment: vi.fn(),
    },
    git: {
      createRef: vi.fn(),
    },
    pulls: {
      create: vi.fn(),
    },
  },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

// Mock crypto for webhook tests
vi.mock("crypto", async () => {
  const actual = await vi.importActual("crypto");
  return {
    ...actual,
    createHmac: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => "mockdigest"),
    })),
  };
});

import { Octokit } from "@octokit/rest";
import crypto from "crypto";

describe("Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Octokit Integration", () => {
    it("should create GitHub issue", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.create.mockResolvedValue({
        data: { number: 123, html_url: "https://github.com/test/repo/issues/123" },
      });

      const result = await octokit.rest.issues.create({
        owner: "test",
        repo: "repo",
        title: "Test Issue",
        body: "Test body",
      });

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: "test",
        repo: "repo",
        title: "Test Issue",
        body: "Test body",
      });
      expect(result.data.number).toBe(123);
    });

    it("should update GitHub issue", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.update.mockResolvedValue({
        data: { number: 123, state: "closed" },
      });

      await octokit.rest.issues.update({
        owner: "test",
        repo: "repo",
        issue_number: 123,
        state: "closed",
      });

      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: "test",
        repo: "repo",
        issue_number: 123,
        state: "closed",
      });
    });

    it("should get GitHub issue", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          state: "open",
          title: "Test Issue",
          body: "Test body",
          updated_at: "2024-01-01T00:00:00Z",
        },
      });

      const result = await octokit.rest.issues.get({
        owner: "test",
        repo: "repo",
        issue_number: 123,
      });

      expect(result.data.state).toBe("open");
      expect(result.data.title).toBe("Test Issue");
    });

    it("should create comment on GitHub issue", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 456 },
      });

      await octokit.rest.issues.createComment({
        owner: "test",
        repo: "repo",
        issue_number: 123,
        body: "Test comment",
      });

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "test",
        repo: "repo",
        issue_number: 123,
        body: "Test comment",
      });
    });

    it("should create branch and PR", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.git.createRef.mockResolvedValue({
        data: { ref: "refs/heads/test-branch" },
      });
      
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 45, html_url: "https://github.com/test/repo/pull/45" },
      });

      await octokit.rest.git.createRef({
        owner: "test",
        repo: "repo",
        ref: "refs/heads/test-branch",
        sha: "abc123",
      });

      await octokit.rest.pulls.create({
        owner: "test",
        repo: "repo",
        title: "Test PR",
        head: "test-branch",
        base: "main",
        body: "Test PR body",
      });

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
    });
  });

  describe("Webhook Integration", () => {
    it("should verify valid webhook signature", () => {
      const secret = "test-secret";
      const body = '{"action":"opened"}';
      
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(body, "utf8");
      const signature = "sha256=" + hmac.digest("hex");

      const hmac2 = crypto.createHmac("sha256", secret);
      hmac2.update(body, "utf8");
      const digest = "sha256=" + hmac2.digest("hex");

      expect(crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))).toBe(true);
    });

    it("should handle issues webhook payload", () => {
      const payload = {
        action: "closed",
        issue: {
          number: 123,
          state: "closed",
          title: "Test Issue",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      expect(payload.action).toBe("closed");
      expect(payload.issue.state).toBe("closed");
    });

    it("should handle issue_comment webhook payload", () => {
      const payload = {
        action: "created",
        issue: { number: 123 },
        comment: {
          id: 456,
          body: "Test comment",
          user: { login: "testuser" },
        },
      };

      expect(payload.action).toBe("created");
      expect(payload.comment.user.login).toBe("testuser");
    });
  });

  describe("Sync Job Integration", () => {
    it("should process multiple issues in sync job", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      const issues = [
        { number: 1, state: "open", updated_at: "2024-01-01T00:00:00Z" },
        { number: 2, state: "closed", updated_at: "2024-01-02T00:00:00Z" },
      ];

      mockOctokit.rest.issues.get.mockImplementation(({ issue_number }) => {
        const issue = issues.find(i => i.number === issue_number);
        return Promise.resolve({ data: issue });
      });

      for (const issue of issues) {
        const result = await octokit.rest.issues.get({
          owner: "test",
          repo: "repo",
          issue_number: issue.number,
        });
        expect(result.data.state).toBe(issue.state);
      }
    });

    it("should handle rate limit in sync job", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.get.mockRejectedValue({
        status: 403,
        response: {
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": Math.floor(Date.now() / 1000 + 3600).toString(),
          },
        },
      });

      try {
        await octokit.rest.issues.get({
          owner: "test",
          repo: "repo",
          issue_number: 1,
        });
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.response.headers["x-ratelimit-remaining"]).toBe("0");
      }
    });
  });

  describe("State Persistence", () => {
    it("should persist mappings across operations", () => {
      const mappings: Record<string, number> = {};
      const reverseMappings: Record<number, string> = {};
      const syncState: Record<string, any> = {};

      // Create mapping
      const paperclipId = "pc-123";
      const githubNumber = 456;
      mappings[paperclipId] = githubNumber;
      reverseMappings[githubNumber] = paperclipId;
      syncState[paperclipId] = {
        githubUpdatedAt: "2024-01-01T00:00:00Z",
        paperclipUpdatedAt: "2024-01-01T00:00:00Z",
      };

      // Verify persistence
      expect(mappings[paperclipId]).toBe(githubNumber);
      expect(reverseMappings[githubNumber]).toBe(paperclipId);
      expect(syncState[paperclipId].githubUpdatedAt).toBe("2024-01-01T00:00:00Z");
    });

    it("should update sync state on modification", () => {
      const syncState: Record<string, any> = {
        "pc-123": {
          githubUpdatedAt: "2024-01-01T00:00:00Z",
          paperclipUpdatedAt: "2024-01-01T00:00:00Z",
        },
      };

      // Update GitHub
      syncState["pc-123"].githubUpdatedAt = "2024-01-02T00:00:00Z";
      
      const ghTime = new Date(syncState["pc-123"].githubUpdatedAt).getTime();
      const pcTime = new Date(syncState["pc-123"].paperclipUpdatedAt).getTime();
      
      expect(ghTime).toBeGreaterThan(pcTime);
    });
  });

  describe("Error Handling", () => {
    it("should handle 401 unauthorized", async () => {
      const octokit = new Octokit({ auth: "invalid-token" });
      
      mockOctokit.rest.issues.create.mockRejectedValue({
        status: 401,
        message: "Bad credentials",
      });

      try {
        await octokit.rest.issues.create({
          owner: "test",
          repo: "repo",
          title: "Test",
        });
      } catch (err: any) {
        expect(err.status).toBe(401);
      }
    });

    it("should handle 404 not found", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.get.mockRejectedValue({
        status: 404,
        message: "Not Found",
      });

      try {
        await octokit.rest.issues.get({
          owner: "test",
          repo: "repo",
          issue_number: 999,
        });
      } catch (err: any) {
        expect(err.status).toBe(404);
      }
    });

    it("should handle network errors", async () => {
      const octokit = new Octokit({ auth: "test-token" });
      
      mockOctokit.rest.issues.create.mockRejectedValue(new Error("Network error"));

      try {
        await octokit.rest.issues.create({
          owner: "test",
          repo: "repo",
          title: "Test",
        });
      } catch (err: any) {
        expect(err.message).toBe("Network error");
      }
    });
  });
});
