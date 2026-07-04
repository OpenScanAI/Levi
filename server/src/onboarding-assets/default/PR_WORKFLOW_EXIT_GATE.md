# PR Workflow Comment Task — Exit Gate and Idempotency Policy

Applies to all issues whose title or description mentions a "PR workflow comment" task, including parent issues such as YAS-46, YAS-63, YAS-78, YAS-81, and YAS-140.

## 1. Before doing any work, read the parent issue thread

When you are assigned to a PR-workflow-comment task that may already have been attempted:

1. Call `GET /api/issues/{parentIssueId}/comments`.
2. Inspect every comment body for references to child issues, linked issues, or created issues.
3. Look for identifiers matching the pattern `YAS-<number>` (or the current project's issue identifier pattern).

## 2. Exit gate — do not recreate work that already exists

If any comment references a child issue that was already created for this exact task:

- **Do not create a new issue.**
- **Do not change the parent issue status to `done`.**
- **Do not post a completion comment that claims a new work product.**
- Post a **single no-op comment** on the parent issue explaining that the linked issue already exists and no further action is required, then exit.

Example no-op comment:

> Exit gate triggered. The requested child issue already exists as `YAS-<NNN>`. No new issue was created and the parent status was left unchanged.

## 3. Single-successful-run disposition gate

After a PR workflow comment task has been marked `done` once and a child issue (or work product) has been accepted:

- Subsequent runs must treat the parent issue as **closed for new work**.
- If the parent is already `done` or already has an accepted child issue, exit immediately with no status change and no new comments unless new information is required.
- Never mark a `done` parent issue as `done` again to avoid run churn.

## 4. Evidence-before-done rule

Before changing any issue to `done`:

- Provide a verifiable artifact: a created issue ID, a commit SHA, a branch name, a PR URL, a diff, or a concrete code change.
- Post the evidence in a comment that references the artifact by ID or URL.
- Only then mark the issue `done`.

## 5. Step-level idempotency instrumentation

For every PR workflow comment task, the assigned agent must treat the run as a resumable state machine with five steps: **draft**, **validate**, **post**, **verify**, and **status update**. On each wake, inspect the issue thread and the target PR for evidence of completed steps, then resume from the first incomplete step. Use the `pr-workflow-idempotency` service in `server/src/services/pr-workflow-idempotency.ts` to perform deterministic lookup and skip decisions.

### 5.1 Required pre-flight checks

Before any side effect, perform these lookups in order:

1. **Issue thread comments** — `GET /api/issues/{issueId}/comments`. Look for:
   - A previously created child issue identifier (e.g., `YAS-<NNN>`).
   - A previously posted PR comment URL (e.g., `https://github.com/{owner}/{repo}/issues/{pr_number}#issuecomment-{id}`).
   - A recorded fingerprint in the format `sha256:<hex>` computed by `computePrCommentFingerprint({owner, repo, prNumber, intendedCommentBody})`.
2. **PR state** — query the GitHub API:
   - `GET /repos/{owner}/{repo}/pulls/{pr_number}` to confirm the PR exists and its state (open/closed/merged).
   - `GET /repos/{owner}/{repo}/issues/{pr_number}/comments` to list existing PR comments.
   - Match each existing PR comment body (whitespace-normalized via `normalizePrCommentBody`) against the intended comment body.
3. **Fingerprint check** — call `resolvePrWorkflowIdempotency({owner, repo, prNumber, intendedCommentBody, issueComments, prComments, priorRunFingerprints, childIssues})` and follow the returned action (`create`, `skip`, `recreate`, or `resume`).

### 5.2 Per-step completion criteria and skip rules

| Step | Completed when | Skip rule |
|------|----------------|-----------|
| Draft | A comment body is selected and recorded in the issue thread or in a child issue | Use the existing draft; do not rewrite unless the requirement changed |
| Validate | The draft body is confirmed to match the task intent and the PR exists | Skip validation if the recorded body already matches the intended body and the PR state is unchanged |
| Post | A PR comment has been created and its URL/ID is recorded | If the PR already contains a comment with the same normalized body, skip posting and report the existing comment URL/ID |
| Verify | The PR comment is reachable via the GitHub API and its body matches the intended body | Re-verify if the recorded comment was deleted or edited; otherwise skip |
| Status update | The issue is marked `done` only after a new artifact was created or a missing artifact was recreated | If only existing evidence was verified, do not change the status; report no-op and exit |

### 5.3 Fingerprint and evidence format

Compute a stable fingerprint for the intended PR comment:

```
fingerprint = sha256(
  "pr:{pull_request_number}|repo:{owner}/{repo}|comment:{normalized_comment_body}"
)
```

`normalized_comment_body` is the trimmed, whitespace-collapsed version of the comment body. Do not include timestamps or run IDs.

When recording evidence after creating or verifying a PR comment, include at minimum:

```json
{
  "fingerprint": "sha256:abc...",
  "prNumber": 123,
  "prCommentId": 456789,
  "prCommentUrl": "https://github.com/owner/repo/issues/123#issuecomment-456789",
  "createdAt": "2026-07-02T12:00:00Z",
  "normalizedBody": "...first 200 chars..."
}
```

### 5.4 Decision tree

```
if existing_child_issue_for_this_task exists and status is done:
    -> exit no-op (single-successful-run gate)
else if existing_child_issue_for_this_task exists and status is not done:
    -> resume from the first incomplete step in the child issue, do not create a new one

if existing_pr_comment_matches_intended_content:
    -> post a no-op comment with the existing evidence URL/comment ID and timestamp
    -> exit without changing status

if prior_run_fingerprint_exists:
    -> if the linked artifact is still present, exit no-op
    -> if the linked artifact is missing, recreate it, record a new fingerprint, and do not mark done unless the issue was not done

if no prior evidence:
    -> create the PR comment
    -> record the fingerprint
    -> mark the issue done
```

### 5.5 No-remaining-work behavior

A run that finds no remaining work must:

- Post a single no-op comment on the issue stating that all steps are already complete and naming the most recent evidence (comment URL/ID or child issue).
- Leave the issue status unchanged.
- Exit immediately.

## 6. When blocked, stop instead of churning

If the task cannot be completed because of missing credentials, a missing repository, a failed command, or ambiguous requirements:

- Set the issue status to `blocked`.
- Post a comment that names the blocker and the next unblock action or owner.
- Do not repeatedly attempt the same failing step.
