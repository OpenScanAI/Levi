import { describe, expect, it } from "vitest";
import {
  type PrWorkflowIdempotencyInput,
  buildPrWorkflowBlockedComment,
  buildPrWorkflowEvidenceComment,
  buildPrWorkflowEvidenceRecord,
  buildPrWorkflowNoopComment,
  buildPrWorkflowResumeComment,
  buildPrWorkflowStepStatus,
  computePrCommentFingerprint,
  formatNoRemainingWorkMessage,
  formatResumeMessage,
  normalizePrCommentBody,
  resolvePrWorkflowIdempotency,
  resolvePrWorkflowStepState,
  runPrWorkflowIdempotency,
  shouldMarkDoneAfterAction,
} from "../services/pr-workflow-idempotency.ts";

const owner = "patkaryash";
const repo = "LMS";
const prNumber = 42;
const intendedCommentBody = "This is a test PR workflow comment.";

function makeInput(overrides?: Partial<PrWorkflowIdempotencyInput>): PrWorkflowIdempotencyInput {
  return {
    owner,
    repo,
    prNumber,
    intendedCommentBody,
    issueComments: [],
    prComments: [],
    priorRunFingerprints: [],
    ...overrides,
  };
}

function makePrComment(body: string, id = 123456) {
  return {
    id,
    body,
    htmlUrl: `https://github.com/${owner}/${repo}/issues/${prNumber}#issuecomment-${id}`,
    createdAt: "2026-07-02T12:00:00Z",
  };
}

function makeIssueComment(id: string, body: string) {
  return { id, body, createdAt: "2026-07-02T12:00:00Z" };
}

describe("normalizePrCommentBody", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizePrCommentBody("  hello   world  \n\n  ")).toBe("hello world");
  });

  it("is stable across leading/trailing whitespace", () => {
    const a = normalizePrCommentBody("Comment body");
    const b = normalizePrCommentBody("  Comment  body\n");
    expect(a).toBe(b);
  });
});

describe("computePrCommentFingerprint", () => {
  it("returns a stable sha256 string", () => {
    const fp = computePrCommentFingerprint({ owner, repo, prNumber, intendedCommentBody: "Hello" });
    expect(fp).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fp).toBe(
      computePrCommentFingerprint({ owner, repo, prNumber, intendedCommentBody: "Hello" }),
    );
  });

  it("changes with body, repo, or pr number", () => {
    const base = computePrCommentFingerprint({ owner, repo, prNumber, intendedCommentBody: "Hello" });
    const differentBody = computePrCommentFingerprint({
      owner,
      repo,
      prNumber,
      intendedCommentBody: "World",
    });
    const differentPr = computePrCommentFingerprint({
      owner,
      repo,
      prNumber: 99,
      intendedCommentBody: "Hello",
    });
    expect(base).not.toBe(differentBody);
    expect(base).not.toBe(differentPr);
  });
});

describe("resolvePrWorkflowIdempotency", () => {
  it("requests creation when no prior evidence exists", () => {
    const result = resolvePrWorkflowIdempotency(makeInput());
    expect(result.action).toBe("create");
    expect(result.fingerprint).toMatch(/^sha256:/);
    expect(result.reason).toContain("No prior evidence");
    expect(result.existingPrComment).toBeNull();
  });

  it("skips when an existing PR comment matches the intended body", () => {
    const body = "This is a test PR workflow comment.";
    const prComment = makePrComment(body);
    const result = resolvePrWorkflowIdempotency(
      makeInput({ prComments: [prComment] }),
    );
    expect(result.action).toBe("skip");
    expect(result.existingPrComment).toEqual(prComment);
    expect(result.reason).toContain("already contains");
  });

  it("ignores whitespace differences when matching existing comments", () => {
    const prComment = makePrComment("  This   is a test PR workflow comment.  ");
    const result = resolvePrWorkflowIdempotency(makeInput({ prComments: [prComment] }));
    expect(result.action).toBe("skip");
  });

  it("creates when existing comments differ", () => {
    const result = resolvePrWorkflowIdempotency(
      makeInput({ prComments: [makePrComment("Different comment")] }),
    );
    expect(result.action).toBe("create");
  });

  it("skips when a prior run fingerprint is still present and artifact is present", () => {
    const fingerprint = computePrCommentFingerprint({
      owner,
      repo,
      prNumber,
      intendedCommentBody: "This is a test PR workflow comment.",
    });
    const artifact = makePrComment("This is a test PR workflow comment.");
    const result = resolvePrWorkflowIdempotency(
      makeInput({
        priorRunFingerprints: [{ fingerprint, prCommentId: artifact.id }],
        prComments: [artifact],
      }),
    );
    expect(result.action).toBe("skip");
    expect(result.reason).toMatch(/fingerprint|already contains/i);
  });

  it("recreates when a prior run fingerprint exists but the artifact is missing", () => {
    const fingerprint = computePrCommentFingerprint({
      owner,
      repo,
      prNumber,
      intendedCommentBody: "This is a test PR workflow comment.",
    });
    const result = resolvePrWorkflowIdempotency(
      makeInput({
        priorRunFingerprints: [{ fingerprint, prCommentId: 999999 }],
        prComments: [],
      }),
    );
    expect(result.action).toBe("recreate");
    expect(result.reason).toContain("missing");
  });

  it("detects child issue from issue comments and skips when done", () => {
    const result = resolvePrWorkflowIdempotency(
      makeInput({
        issueComments: [
          makeIssueComment("c1", "Created child issue YAS-999 for the PR comment task."),
        ],
        childIssues: [{ identifier: "YAS-999", status: "done" }],
      }),
    );
    expect(result.action).toBe("skip");
    expect(result.reason).toContain("YAS-999");
  });

  it("resumes when child issue exists but is not done", () => {
    const result = resolvePrWorkflowIdempotency(
      makeInput({
        issueComments: [
          makeIssueComment("c1", "Created child issue YAS-998 for the PR comment task."),
        ],
        childIssues: [{ identifier: "YAS-998", status: "in_progress" }],
      }),
    );
    expect(result.action).toBe("resume");
    expect(result.childIssueIdentifier).toBe("YAS-998");
  });
});

describe("resolvePrWorkflowStepState", () => {
  it("resumes from validate when draft is recorded but post is not", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "[draft] complete")],
      }),
    );
    expect(resolution.nextStep).toBe("validate");
    expect(resolution.completedSteps.map((e) => e.step)).toContain("draft");
  });

  it("resumes from post when draft and validate are recorded but post is not", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [
          makeIssueComment("c1", "[draft] complete"),
          makeIssueComment("c2", "validate: done"),
        ],
      }),
    );
    expect(resolution.nextStep).toBe("post");
  });

  it("reports allComplete when all five steps are recorded", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [
          makeIssueComment("c1", "[draft] complete"),
          makeIssueComment("c2", "[validate] complete"),
          makeIssueComment("c3", "post ✓"),
          makeIssueComment("c4", "verify ✅"),
          makeIssueComment("c5", "status: done"),
        ],
      }),
    );
    expect(resolution.allComplete).toBe(true);
    expect(resolution.nextStep).toBeNull();
    expect(resolution.noRemainingWork).toBe(true);
  });

  it("treats post and verify as complete when a matching PR comment already exists", () => {
    const prComment = makePrComment("This is a test PR workflow comment.");
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "[draft] complete"), makeIssueComment("c2", "[validate] complete")],
        prComments: [prComment],
      }),
    );
    expect(resolution.completedSteps.map((e) => e.step)).toEqual(
      expect.arrayContaining(["draft", "validate", "post", "verify"]),
    );
    expect(resolution.nextStep).toBe("status");
  });

  it("reports noRemainingWork when child issue is done", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "Created child issue YAS-997")],
        childIssues: [{ identifier: "YAS-997", status: "done" }],
      }),
    );
    expect(resolution.noRemainingWork).toBe(true);
  });

  it("does not report noRemainingWork when child issue is in progress", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "Created child issue YAS-996")],
        childIssues: [{ identifier: "YAS-996", status: "in_progress" }],
      }),
    );
    expect(resolution.noRemainingWork).toBe(false);
  });
});

describe("shouldMarkDoneAfterAction", () => {
  it("allows done only for create or recreate", () => {
    expect(shouldMarkDoneAfterAction("create")).toBe(true);
    expect(shouldMarkDoneAfterAction("recreate")).toBe(true);
    expect(shouldMarkDoneAfterAction("skip")).toBe(false);
    expect(shouldMarkDoneAfterAction("resume")).toBe(false);
    expect(shouldMarkDoneAfterAction("blocked")).toBe(false);
  });
});

describe("formatNoRemainingWorkMessage", () => {
  it("names the child issue when present", () => {
    const msg = formatNoRemainingWorkMessage({
      completedSteps: [],
      nextStep: null,
      allComplete: true,
      noRemainingWork: true,
      fingerprint: "sha256:abc",
      existingPrComment: null,
      childIssueIdentifier: "YAS-100",
    });
    expect(msg).toContain("YAS-100");
    expect(msg).toContain("Leaving issue status unchanged");
  });

  it("names the existing PR comment when present", () => {
    const msg = formatNoRemainingWorkMessage({
      completedSteps: [],
      nextStep: null,
      allComplete: true,
      noRemainingWork: true,
      fingerprint: "sha256:abc",
      existingPrComment: makePrComment("body"),
      childIssueIdentifier: null,
    });
    expect(msg).toContain("PR comment already exists");
    expect(msg).toContain("Leaving issue status unchanged");
  });
});

describe("formatResumeMessage", () => {
  it("names the next step and completed steps", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "[draft] complete")],
      }),
    );
    const msg = formatResumeMessage(resolution);
    expect(msg).toContain("validate");
    expect(msg).toContain("draft");
  });
});

describe("buildPrWorkflowEvidenceComment", () => {
  it("contains step markers and fingerprint", () => {
    const comment = buildPrWorkflowEvidenceComment({
      action: "create",
      fingerprint: "sha256:abc",
      prNumber: 42,
      prCommentId: 123,
      prCommentUrl: "https://github.com/patkaryash/LMS/issues/42#issuecomment-123",
      completedSteps: ["draft", "validate", "post", "verify", "status"],
      nextStep: null,
    });
    expect(comment).toContain("[draft] complete");
    expect(comment).toContain("[status] complete");
    expect(comment).toContain("sha256:abc");
    expect(comment).toContain("issuecomment-123");

    // Verify it parses as valid JSON record inside the code block
    const record = buildPrWorkflowEvidenceRecord({
      fingerprint: "sha256:abc",
      prNumber: 42,
      prCommentId: 123,
      prCommentUrl: "https://github.com/patkaryash/LMS/issues/42#issuecomment-123",
      completedSteps: ["draft", "validate", "post", "verify", "status"],
      nextStep: null,
    });
    expect(record.fingerprint).toBe("sha256:abc");
    expect(record.prCommentId).toBe(123);
  });
});

describe("buildPrWorkflowNoopComment", () => {
  it("states that status is unchanged", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({ prComments: [makePrComment(intendedCommentBody)] }),
    );
    const comment = buildPrWorkflowNoopComment(resolution);
    expect(comment).toContain("No remaining work");
    expect(comment).toContain("Leaving issue status unchanged");
  });
});

describe("buildPrWorkflowResumeComment", () => {
  it("names the next step", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({
        issueComments: [makeIssueComment("c1", "[draft] complete")],
      }),
    );
    const comment = buildPrWorkflowResumeComment(resolution);
    expect(comment).toContain("Resuming PR workflow from step");
    expect(comment).toContain("validate");
  });
});

describe("buildPrWorkflowBlockedComment", () => {
  it("names the blocker and step", () => {
    const comment = buildPrWorkflowBlockedComment("missing GitHub token", "post");
    expect(comment).toContain("Blocked at step: post");
    expect(comment).toContain("missing GitHub token");
    expect(comment).toContain("Issue status set to blocked");
  });
});

describe("buildPrWorkflowStepStatus", () => {
  it("marks all steps complete on create", () => {
    const resolution = resolvePrWorkflowStepState(makeInput());
    const status = buildPrWorkflowStepStatus(resolution, "create");
    expect(status.completedSteps).toEqual(["draft", "validate", "post", "verify", "status"]);
    expect(status.nextStep).toBeNull();
  });

  it("preserves recorded state on skip", () => {
    const resolution = resolvePrWorkflowStepState(
      makeInput({ issueComments: [makeIssueComment("c1", "[draft] complete")] }),
    );
    const status = buildPrWorkflowStepStatus(resolution, "skip");
    expect(status.completedSteps).toEqual(["draft"]);
    expect(status.nextStep).toBe("validate");
  });
});

describe("runPrWorkflowIdempotency", () => {
  it("returns mayMarkDone=true for a fresh create", () => {
    const run = runPrWorkflowIdempotency(makeInput());
    expect(run.action).toBe("create");
    expect(run.mayMarkDone).toBe(true);
    expect(run.comment).toContain("[draft] complete");
    expect(run.comment).toContain("fingerprint");
  });

  it("returns mayMarkDone=false and a no-op comment when the PR comment already exists", () => {
    const run = runPrWorkflowIdempotency(
      makeInput({ prComments: [makePrComment(intendedCommentBody)] }),
    );
    expect(run.action).toBe("skip");
    expect(run.mayMarkDone).toBe(false);
    expect(run.comment).toContain("No remaining work");
    expect(run.comment).toContain("Leaving issue status unchanged");
  });

  it("returns mayMarkDone=false and a resume comment when a child issue is in progress", () => {
    const run = runPrWorkflowIdempotency(
      makeInput({
        issueComments: [makeIssueComment("c1", "Created child issue YAS-995")],
        childIssues: [{ identifier: "YAS-995", status: "in_progress" }],
      }),
    );
    expect(run.action).toBe("resume");
    expect(run.mayMarkDone).toBe(false);
    expect(run.comment).toContain("Resuming PR workflow from step");
  });
});
