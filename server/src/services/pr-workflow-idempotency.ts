import { createHash } from "node:crypto";

export type PrWorkflowIdempotencyAction = "create" | "skip" | "recreate" | "resume" | "blocked";

export type PrWorkflowStep = "draft" | "validate" | "post" | "verify" | "status";

export const PR_WORKFLOW_STEPS: readonly PrWorkflowStep[] = [
  "draft",
  "validate",
  "post",
  "verify",
  "status",
] as const;

export type PrWorkflowIdempotencyIssueComment = {
  id: string;
  body: string;
  createdAt: string;
};

export type PrWorkflowIdempotencyPrComment = {
  id: number;
  body: string;
  htmlUrl: string;
  createdAt: string;
};

export type PrWorkflowIdempotencyPriorFingerprint = {
  fingerprint: string;
  prCommentId?: number | null;
};

export type PrWorkflowIdempotencyChildIssue = {
  identifier: string;
  status: string;
};

export type PrWorkflowStepEvidence = {
  step: PrWorkflowStep;
  recordedAt: string;
  sourceCommentId?: string;
  artifact?: PrWorkflowIdempotencyPrComment;
  fingerprint?: string;
  normalizedBody?: string;
};

export type PrWorkflowStepResolution = {
  completedSteps: PrWorkflowStepEvidence[];
  nextStep: PrWorkflowStep | null;
  allComplete: boolean;
  noRemainingWork: boolean;
  fingerprint: string;
  existingPrComment: PrWorkflowIdempotencyPrComment | null;
  childIssueIdentifier: string | null;
};

export type PrWorkflowIdempotencyInput = {
  owner: string;
  repo: string;
  prNumber: number;
  intendedCommentBody: string;
  issueComments: PrWorkflowIdempotencyIssueComment[];
  prComments: PrWorkflowIdempotencyPrComment[];
  priorRunFingerprints: PrWorkflowIdempotencyPriorFingerprint[];
  childIssues?: PrWorkflowIdempotencyChildIssue[];
};

export type PrWorkflowIdempotencyResult = {
  action: PrWorkflowIdempotencyAction;
  fingerprint: string;
  reason: string;
  existingPrComment: PrWorkflowIdempotencyPrComment | null;
  childIssueIdentifier: string | null;
  blockerReason?: string | null;
};

const IDENTIFIER_PATTERN = /\b[A-Z]{2,}-\d+\b/g;
const PR_COMMENT_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/issues\/\d+#issuecomment-\d+/g;
const FINGERPRINT_PATTERN = /sha256:[a-f0-9]{64}/g;

export function normalizePrCommentBody(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function computePrCommentFingerprint(input: {
  owner: string;
  repo: string;
  prNumber: number;
  intendedCommentBody: string;
}): string {
  const normalized = normalizePrCommentBody(input.intendedCommentBody);
  const payload = `pr:${input.prNumber}|repo:${input.owner}/${input.repo}|comment:${normalized}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return `sha256:${hash}`;
}

function extractIdentifiers(body: string): string[] {
  const matches = body.match(IDENTIFIER_PATTERN) ?? [];
  return Array.from(new Set(matches));
}

function findChildIssueInComments(
  comments: PrWorkflowIdempotencyIssueComment[],
  childIssues: PrWorkflowIdempotencyChildIssue[],
): PrWorkflowIdempotencyChildIssue | null {
  for (const comment of comments) {
    const identifiers = extractIdentifiers(comment.body);
    for (const identifier of identifiers) {
      const match = childIssues.find((child) => child.identifier === identifier);
      if (match) return match;
    }
  }
  return null;
}

function findExistingMatchingPrComment(
  intended: string,
  prComments: PrWorkflowIdempotencyPrComment[],
): PrWorkflowIdempotencyPrComment | null {
  const normalized = normalizePrCommentBody(intended);
  return prComments.find((c) => normalizePrCommentBody(c.body) === normalized) ?? null;
}

function findFingerprintInComments(
  fingerprint: string,
  comments: PrWorkflowIdempotencyIssueComment[],
): boolean {
  return comments.some((c) => c.body.includes(fingerprint));
}

function stepMarkerPattern(step: string): RegExp {
  return new RegExp(
    `\\[?${step}\\]?[\\s:]*(?:complete|completed|done|✓|✅|skipped|skip)`,
    "i",
  );
}

function stepRecordForComment(
  step: PrWorkflowStep,
  comment: PrWorkflowIdempotencyIssueComment,
  prComments: PrWorkflowIdempotencyPrComment[],
  fingerprint: string,
): PrWorkflowStepEvidence {
  const artifact = prComments.find((c) =>
    comment.body.includes(c.htmlUrl) || comment.body.includes(String(c.id)),
  );
  return {
    step,
    recordedAt: comment.createdAt,
    sourceCommentId: comment.id,
    artifact,
    fingerprint: comment.body.includes(fingerprint) ? fingerprint : undefined,
    normalizedBody: artifact ? normalizePrCommentBody(artifact.body) : undefined,
  };
}

/**
 * Parse issue comments to reconstruct which workflow steps have already been
 * completed. A comment is considered evidence for a step if it contains the
 * step name plus one of the completion markers, e.g. "[draft] complete" or
 * "post: done" or "verify ✓".
 */
export function resolveCompletedStepsFromComments(
  comments: PrWorkflowIdempotencyIssueComment[],
  prComments: PrWorkflowIdempotencyPrComment[],
  fingerprint: string,
): PrWorkflowStepEvidence[] {
  const completed: PrWorkflowStepEvidence[] = [];

  for (const comment of comments) {
    for (const step of PR_WORKFLOW_STEPS) {
      if (stepMarkerPattern(step).test(comment.body)) {
        const existing = completed.find((e) => e.step === step);
        if (!existing) {
          completed.push(
            stepRecordForComment(step, comment, prComments, fingerprint),
          );
        }
      }
    }
  }

  return completed;
}

function findNextStep(
  completedSteps: PrWorkflowStepEvidence[],
): PrWorkflowStep | null {
  const completedSet = new Set(completedSteps.map((e) => e.step));
  return PR_WORKFLOW_STEPS.find((step) => !completedSet.has(step)) ?? null;
}

function markStepCompleted(
  completedSteps: PrWorkflowStepEvidence[],
  step: PrWorkflowStep,
  recordedAt: string,
  artifact: PrWorkflowIdempotencyPrComment,
  fingerprint: string,
): void {
  if (!completedSteps.some((e) => e.step === step)) {
    completedSteps.push({
      step,
      recordedAt,
      artifact,
      fingerprint,
      normalizedBody: normalizePrCommentBody(artifact.body),
    });
  }
}

/**
 * Step-level resolution for the PR workflow comment task. Returns the set of
 * completed steps, the next step to execute, and whether any work remains.
 *
 * A run that finds no remaining work should leave the issue status unchanged and
 * report a no-op comment rather than marking the issue done.
 */
export function resolvePrWorkflowStepState(
  input: PrWorkflowIdempotencyInput,
): PrWorkflowStepResolution {
  const fingerprint = computePrCommentFingerprint({
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    intendedCommentBody: input.intendedCommentBody,
  });

  const existingPrComment = findExistingMatchingPrComment(
    input.intendedCommentBody,
    input.prComments,
  );

  const childIssue = findChildIssueInComments(input.issueComments, input.childIssues ?? []);
  const childIssueIdentifier = childIssue ? childIssue.identifier : null;

  const completedSteps = resolveCompletedStepsFromComments(
    input.issueComments,
    input.prComments,
    fingerprint,
  );

  // If a matching PR comment exists on the PR but no explicit step evidence was
  // recorded, treat the post and verify steps as implicitly complete. This
  // lets the workflow resume from the status step after an out-of-band post.
  if (existingPrComment) {
    markStepCompleted(completedSteps, "post", existingPrComment.createdAt, existingPrComment, fingerprint);
    markStepCompleted(completedSteps, "verify", existingPrComment.createdAt, existingPrComment, fingerprint);
  }

  // If issue comments contain a draft/validate record but no artifact was found
  // because the PR comment was not yet created, the next step is still the first
  // incomplete one.
  const nextStep = findNextStep(completedSteps);
  const allComplete = nextStep === null;
  const noRemainingWork = allComplete || (childIssue !== null && (childIssue.status === "done" || childIssue.status === "cancelled"));

  return {
    completedSteps,
    nextStep,
    allComplete,
    noRemainingWork,
    fingerprint,
    existingPrComment,
    childIssueIdentifier,
  };
}

export function resolvePrWorkflowIdempotency(
  input: PrWorkflowIdempotencyInput,
): PrWorkflowIdempotencyResult {
  const stepState = resolvePrWorkflowStepState(input);

  const childIssue = findChildIssueInComments(input.issueComments, input.childIssues ?? []);
  if (childIssue) {
    if (childIssue.status === "done" || childIssue.status === "cancelled") {
      return {
        action: "skip",
        fingerprint: stepState.fingerprint,
        reason: `Child issue ${childIssue.identifier} is already ${childIssue.status}; exit gate active.`,
        existingPrComment: stepState.existingPrComment,
        childIssueIdentifier: childIssue.identifier,
      };
    }
    return {
      action: "resume",
      fingerprint: stepState.fingerprint,
      reason: `Child issue ${childIssue.identifier} exists and is ${childIssue.status}; resume from first incomplete step (${stepState.nextStep ?? "none"}).`,
      existingPrComment: stepState.existingPrComment,
      childIssueIdentifier: childIssue.identifier,
    };
  }

  const existingPrComment = stepState.existingPrComment;
  if (existingPrComment) {
    return {
      action: "skip",
      fingerprint: stepState.fingerprint,
      reason: `PR #${input.prNumber} already contains a matching comment (${existingPrComment.htmlUrl}). No new comment needed.`,
      existingPrComment,
      childIssueIdentifier: null,
    };
  }

  const fingerprintRecord = input.priorRunFingerprints.find(
    (f) => f.fingerprint === stepState.fingerprint,
  );
  if (fingerprintRecord) {
    if (fingerprintRecord.prCommentId) {
      const artifactStillPresent = input.prComments.some(
        (c) => c.id === fingerprintRecord.prCommentId,
      );
      if (artifactStillPresent) {
        return {
          action: "skip",
          fingerprint: stepState.fingerprint,
          reason: `Prior run fingerprint ${stepState.fingerprint} is still present on PR #${input.prNumber}. No new comment needed.`,
          existingPrComment:
            input.prComments.find((c) => c.id === fingerprintRecord.prCommentId) ?? null,
          childIssueIdentifier: null,
        };
      }
    }
    return {
      action: "recreate",
      fingerprint: stepState.fingerprint,
      reason: `Prior run fingerprint ${stepState.fingerprint} exists but the linked artifact is missing. Recreate the comment.`,
      existingPrComment: null,
      childIssueIdentifier: null,
    };
  }

  return {
    action: "create",
    fingerprint: stepState.fingerprint,
    reason: "No prior evidence found for this PR comment. Proceed to create.",
    existingPrComment: null,
    childIssueIdentifier: null,
  };
}

/**
 * Format a human-readable no-remaining-work message that names the most
 * recent evidence (child issue, PR comment, or fingerprint). This should be
 * used when a run decides there is nothing to do and must NOT mark the issue
 * done.
 */
export function formatNoRemainingWorkMessage(
  resolution: PrWorkflowStepResolution,
): string {
  if (resolution.childIssueIdentifier) {
    return `No remaining work: child issue ${resolution.childIssueIdentifier} is already complete. All workflow steps (${PR_WORKFLOW_STEPS.join(", ")}) are satisfied. Leaving issue status unchanged.`;
  }

  if (resolution.existingPrComment) {
    return `No remaining work: PR comment already exists at ${resolution.existingPrComment.htmlUrl} (id=${resolution.existingPrComment.id}). All workflow steps (${PR_WORKFLOW_STEPS.join(", ")}) are satisfied. Leaving issue status unchanged.`;
  }

  if (resolution.allComplete) {
    return `No remaining work: all workflow steps (${PR_WORKFLOW_STEPS.join(", ")}) are complete. Leaving issue status unchanged.`;
  }

  return `No remaining work: all workflow steps (${PR_WORKFLOW_STEPS.join(", ")}) are complete. Leaving issue status unchanged.`;
}

/**
 * Format a resume message naming the first incomplete step and the evidence
 * that was found.
 */
export function formatResumeMessage(
  resolution: PrWorkflowStepResolution,
): string {
  const completed = resolution.completedSteps.map((e) => e.step).join(", ");
  const next = resolution.nextStep ?? "none";
  return `Resuming PR workflow from step '${next}'. Completed steps so far: ${completed || "none"}. Fingerprint: ${resolution.fingerprint}.`;
}

/**
 * Determine whether a run that found no new work is allowed to mark the issue
 * done. This is only true when the current run created a brand-new artifact or
 * recreated a missing artifact. Verification-only runs must return false.
 */
export function shouldMarkDoneAfterAction(
  action: PrWorkflowIdempotencyAction,
): boolean {
  return action === "create" || action === "recreate";
}

/**
 * Build the evidence record to post back to the issue thread after any side
 * effect. This is the durable record used by future runs to skip completed
 * steps.
 */

export type PrWorkflowStepEvidenceFormat = {
  step: PrWorkflowStep;
  artifact: string;
  check: string;
  evidence: string;
};

export const PR_WORKFLOW_STEP_EVIDENCE_FORMAT: readonly PrWorkflowStepEvidenceFormat[] = [
  {
    step: "draft",
    artifact: "Comment body text (normalized)",
    check: "Intended PR comment body is non-empty and normalized",
    evidence: "quoted comment body snippet and fingerprint",
  },
  {
    step: "validate",
    artifact: "Context summary: issue comments, PR comments, prior fingerprints, child issues",
    check: "No duplicate PR comment; no prior fingerprint still present; no done child issue",
    evidence: "URLs of matching PR comments, fingerprint values, child issue identifiers and statuses",
  },
  {
    step: "post",
    artifact: "GitHub PR comment object",
    check: "GitHub API returns a created comment with id and html_url",
    evidence: "PR comment URL (https://github.com/{owner}/{repo}/issues/{prNumber}#issuecomment-{id})",
  },
  {
    step: "verify",
    artifact: "Re-fetched PR comment from GitHub API",
    check: "Comment body matches intended body after normalization",
    evidence: "quoted posted body and comment id",
  },
  {
    step: "status",
    artifact: "Issue status update",
    check: "Issue status transitions to done only after a new or recreated artifact",
    evidence: "Issue status value and action (create/recreate) that authorized the transition",
  },
] as const;

export type PrWorkflowStepEvidenceLog = {
  step: PrWorkflowStep;
  completed: boolean;
  skipped: boolean;
  artifact?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
};

/**
 * Build a per-step evidence log for a PR workflow comment task. Each step is
 * marked completed/skipped based on the resolved step state, and the expected
 * evidence format is attached so callers can render or persist a concrete
 * artifact checklist.
 */
export function buildPrWorkflowStepEvidenceLog(
  resolution: PrWorkflowStepResolution,
): PrWorkflowStepEvidenceLog[] {
  const completedSet = new Set(resolution.completedSteps.map((e) => e.step));
  return PR_WORKFLOW_STEPS.map((step) => {
    const format = PR_WORKFLOW_STEP_EVIDENCE_FORMAT.find((f) => f.step === step)!;
    const completed = completedSet.has(step);
    const skipped = step === resolution.nextStep;
    const artifact = step === "post" || step === "verify"
      ? resolution.existingPrComment
        ? { commentId: resolution.existingPrComment.id, htmlUrl: resolution.existingPrComment.htmlUrl }
        : undefined
      : step === "status"
        ? resolution.allComplete
          ? { status: "done" }
          : undefined
        : step === "draft"
          ? { fingerprint: resolution.fingerprint }
          : step === "validate"
            ? {
                existingPrComment: resolution.existingPrComment
                  ? { id: resolution.existingPrComment.id, htmlUrl: resolution.existingPrComment.htmlUrl }
                  : null,
                childIssueIdentifier: resolution.childIssueIdentifier,
              }
            : undefined;
    return {
      step,
      completed,
      skipped,
      artifact: artifact ?? undefined,
      evidence: {
        artifact: format.artifact,
        check: format.check,
        evidence: format.evidence,
      },
    };
  });
}

export function buildPrWorkflowEvidenceRecord(input: {
  fingerprint: string;
  prNumber: number;
  prCommentId?: number | null;
  prCommentUrl?: string | null;
  createdAt?: string;
  normalizedBody?: string;
  completedSteps?: PrWorkflowStep[];
  nextStep?: PrWorkflowStep | null;
}): Record<string, unknown> {
  return {
    fingerprint: input.fingerprint,
    prNumber: input.prNumber,
    prCommentId: input.prCommentId ?? null,
    prCommentUrl: input.prCommentUrl ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    normalizedBody: input.normalizedBody ?? null,
    completedSteps: input.completedSteps ?? [],
    nextStep: input.nextStep ?? null,
  };
}

/**
 * Compact evidence comment to post on the issue after a successful create or
 * recreate. The string must contain the step completion markers and the
 * fingerprint so future runs can parse it.
 */
export function buildPrWorkflowEvidenceComment(input: {
  action: PrWorkflowIdempotencyAction;
  fingerprint: string;
  prNumber: number;
  prCommentId?: number | null;
  prCommentUrl?: string | null;
  createdAt?: string;
  completedSteps?: PrWorkflowStep[];
  nextStep?: PrWorkflowStep | null;
}): string {
  const record = buildPrWorkflowEvidenceRecord(input);
  const steps = (input.completedSteps ?? ["draft", "validate", "post", "verify", "status"])
    .map((s) => `[${s}] complete`)
    .join(" | ");
  const lines = [
    `PR workflow step evidence: ${steps}`,
    `Action: ${input.action}`,
    `Fingerprint: ${input.fingerprint}`,
    `PR comment: ${input.prCommentUrl ?? "n/a"} (id=${input.prCommentId ?? "n/a"})`,
    `Created at: ${input.createdAt ?? new Date().toISOString()}`,
    `Next step: ${input.nextStep ?? "none"}`,
    "",
    "```json",
    JSON.stringify(record, null, 2),
    "```",
  ];
  return lines.join("\n");
}

/**
 * Build a no-op comment to post when the run finds no remaining work. The
 * comment explicitly states that the issue status was left unchanged.
 */
export function buildPrWorkflowNoopComment(
  resolution: PrWorkflowStepResolution,
): string {
  return formatNoRemainingWorkMessage(resolution);
}

/**
 * Build a resume comment to post when the run resumes from an incomplete step.
 */
export function buildPrWorkflowResumeComment(
  resolution: PrWorkflowStepResolution,
): string {
  return formatResumeMessage(resolution);
}

/**
 * Build a blocked comment to post when a step cannot be completed because of a
 * missing credential, unreachable repo, or other external blocker.
 */
export function buildPrWorkflowBlockedComment(
  blockerReason: string,
  nextStep?: PrWorkflowStep | null,
): string {
  const nextLine = nextStep ? `Blocked at step: ${nextStep}` : "Blocked before any step.";
  return `${nextLine}\n\nBlocker: ${blockerReason}\n\nIssue status set to blocked. Do not retry until the blocker is resolved.`;
}

/**
 * Given a step-level resolution and an action, return the exact completion
 * markers and next-step that should be recorded in the issue thread after this
 * run. This is the canonical source of truth for what was done and what is
 * left.
 */
export function buildPrWorkflowStepStatus(
  resolution: PrWorkflowStepResolution,
  action: PrWorkflowIdempotencyAction,
): {
  completedSteps: PrWorkflowStep[];
  nextStep: PrWorkflowStep | null;
} {
  if (action === "create" || action === "recreate") {
    // A successful side-effect run completes the whole step chain.
    return {
      completedSteps: [...PR_WORKFLOW_STEPS],
      nextStep: null,
    };
  }

  if (action === "resume") {
    // Resume starts at the first incomplete step, but we only record what was
    // already completed. The next run will again resume from that step.
    return {
      completedSteps: resolution.completedSteps.map((e) => e.step),
      nextStep: resolution.nextStep,
    };
  }

  // skip / blocked: no new progress recorded; state is unchanged.
  return {
    completedSteps: resolution.completedSteps.map((e) => e.step),
    nextStep: resolution.nextStep,
  };
}

/**
 * Main entry point for a single PR workflow run. Given the full input, it
 * returns the action to take, the exact comment to post back to the issue, and
 * whether the issue may be marked done.
 */
export function runPrWorkflowIdempotency(
  input: PrWorkflowIdempotencyInput,
): {
  action: PrWorkflowIdempotencyAction;
  fingerprint: string;
  comment: string;
  mayMarkDone: boolean;
  existingPrComment: PrWorkflowIdempotencyPrComment | null;
  childIssueIdentifier: string | null;
  blockerReason?: string | null;
} {
  const resolution = resolvePrWorkflowStepState(input);
  const idempotency = resolvePrWorkflowIdempotency(input);

  if (idempotency.action === "blocked") {
    return {
      action: "blocked",
      fingerprint: idempotency.fingerprint,
      comment: buildPrWorkflowBlockedComment(idempotency.blockerReason ?? "unknown blocker"),
      mayMarkDone: false,
      existingPrComment: idempotency.existingPrComment,
      childIssueIdentifier: idempotency.childIssueIdentifier,
      blockerReason: idempotency.blockerReason,
    };
  }

  if (idempotency.action === "skip" || idempotency.action === "resume") {
    const comment = idempotency.action === "resume"
      ? buildPrWorkflowResumeComment(resolution)
      : buildPrWorkflowNoopComment(resolution);
    return {
      action: idempotency.action,
      fingerprint: idempotency.fingerprint,
      comment,
      mayMarkDone: false,
      existingPrComment: idempotency.existingPrComment,
      childIssueIdentifier: idempotency.childIssueIdentifier,
    };
  }

  // create or recreate
  const stepStatus = buildPrWorkflowStepStatus(resolution, idempotency.action);
  const comment = buildPrWorkflowEvidenceComment({
    action: idempotency.action,
    fingerprint: idempotency.fingerprint,
    prNumber: input.prNumber,
    completedSteps: stepStatus.completedSteps,
    nextStep: stepStatus.nextStep,
  });

  return {
    action: idempotency.action,
    fingerprint: idempotency.fingerprint,
    comment,
    mayMarkDone: shouldMarkDoneAfterAction(idempotency.action),
    existingPrComment: null,
    childIssueIdentifier: null,
  };
}
