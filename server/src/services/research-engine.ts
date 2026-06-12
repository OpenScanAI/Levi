/**
 * Research Engine Service
 *
 * Core orchestrator for autonomous research execution.
 *
 * Workflow:
 *   planning → running → [cancelling] → completed/failed
 *
 * Each session runs sequentially (1 concurrent per company).
 */
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  researchSessions,
  researchTasks,
  researchFindings,
  researchSources,
} from "@paperclipai/db";
import type { Config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { generateResearchPlan, extractFindingsFromContent, generateResearchReport } from "./research-llm.js";
import { createSearchProvider, type SearchProvider, filterSourcesByQuality, fetchPageContent } from "./research-search.js";
import { researchProgressService } from "./research-progress.js";

// In-memory lock: one session per company at a time
const runningSessions = new Map<string, string>(); // companyId -> sessionId
const cancelFlags = new Map<string, boolean>(); // sessionId -> shouldCancel

export interface ResearchEngineDeps {
  db: Db;
  config: Config;
}

export function researchEngine(deps: ResearchEngineDeps) {
  const { db, config } = deps;
  const progress = researchProgressService(db);

  // Resolve search provider based on config
  const providerType = config.researchSearchProvider;
  const providerKey =
    providerType === "serper"
      ? config.serperApiKey
      : providerType === "semantic-scholar"
        ? config.semanticScholarApiKey
        : undefined;
  const searchProvider: SearchProvider = createSearchProvider(providerType, providerKey);

  return {
    /**
     * Start executing a research session.
     */
    async executeSession(sessionId: string, companyId: string): Promise<void> {
      // Check concurrent session lock
      const existing = runningSessions.get(companyId);
      if (existing && existing !== sessionId) {
        throw new Error(`Another research session is already running for this company: ${existing}`);
      }

      // Set lock
      runningSessions.set(companyId, sessionId);
      cancelFlags.set(sessionId, false);

      try {
        await runSession(sessionId, companyId);
      } finally {
        runningSessions.delete(companyId);
        cancelFlags.delete(sessionId);
      }
    },

    /**
     * Request cancellation of a running session.
     */
    async requestCancel(sessionId: string, companyId: string): Promise<boolean> {
      const running = runningSessions.get(companyId);
      if (running !== sessionId) {
        return false; // Not running or different session
      }

      cancelFlags.set(sessionId, true);

      // Update status to cancelling
      await db
        .update(researchSessions)
        .set({ status: "cancelling" as any, updatedAt: new Date() })
        .where(
          and(
            eq(researchSessions.id, sessionId),
            eq(researchSessions.companyId, companyId)
          )
        );

      progress.publishSessionUpdate(companyId, sessionId, "cancelling", {
        message: "Cancellation requested",
      });

      return true;
    },

    /**
     * Check if a session is currently running.
     */
    isRunning(sessionId: string, companyId: string): boolean {
      return runningSessions.get(companyId) === sessionId;
    },

    /**
     * Retry a single failed task.
     * Resets the task to pending and re-executes it.
     */
    async retryTask(taskId: string, sessionId: string, companyId: string): Promise<void> {
      // Check if session is already running
      const existing = runningSessions.get(companyId);
      if (existing && existing !== sessionId) {
        throw new Error(`Another research session is already running for this company: ${existing}`);
      }

      // Fetch the task
      const [task] = await db
        .select()
        .from(researchTasks)
        .where(
          and(
            eq(researchTasks.id, taskId),
            eq(researchTasks.sessionId, sessionId),
            eq(researchTasks.companyId, companyId)
          )
        )
        .limit(1);

      if (!task) {
        throw new Error("Research task not found");
      }

      if (task.status !== "failed") {
        throw new Error(`Cannot retry task with status: ${task.status}. Only failed tasks can be retried.`);
      }

      // Set lock
      runningSessions.set(companyId, sessionId);
      cancelFlags.set(sessionId, false);

      try {
        // Reset task to pending
        await db
          .update(researchTasks)
          .set({
            status: "pending" as any,
            findingsSummary: null,
            sources: null,
            startedAt: null,
            completedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(researchTasks.id, taskId));

        // Delete old findings for this task
        await db
          .delete(researchFindings)
          .where(eq(researchFindings.taskId, taskId));

        progress.publishTaskUpdate(companyId, sessionId, taskId, "pending", {
          message: "Task queued for retry",
        });

        // Update session status back to running if it was failed
        await db
          .update(researchSessions)
          .set({ status: "running" as any, updatedAt: new Date() })
          .where(eq(researchSessions.id, sessionId));

        progress.publishSessionUpdate(companyId, sessionId, "running", {
          message: `Retrying task: ${task.title}`,
        });

        // Re-execute the task
        await executeTask(taskId, sessionId, companyId, task.title);
        await progress.updateProgress(sessionId, companyId);

        // Check if all tasks are now completed
        const remainingTasks = await db
          .select()
          .from(researchTasks)
          .where(eq(researchTasks.sessionId, sessionId));

        const allCompleted = remainingTasks.every((t) => t.status === "completed");
        const anyFailed = remainingTasks.some((t) => t.status === "failed");

        if (allCompleted) {
          // Generate report
          const [session] = await db
            .select()
            .from(researchSessions)
            .where(
              and(
                eq(researchSessions.id, sessionId),
                eq(researchSessions.companyId, companyId)
              )
            )
            .limit(1);

          const allFindings = await db
            .select()
            .from(researchFindings)
            .where(eq(researchFindings.sessionId, sessionId))
            .orderBy(researchFindings.createdAt);

          const reportFindings = allFindings.map((f) => ({
            content: f.content,
            category: f.category || "General",
            confidence: f.confidence || "medium",
            sourceUrl: f.sourceUrl,
            sourceTitle: f.sourceTitle,
            sourceDomain: f.sourceDomain,
          }));

          const generated = await generateResearchReport(
            session.query,
            reportFindings,
            { model: config.researchLlmModel, apiKey: config.researchLlmApiKey }
          );

          await db
            .update(researchSessions)
            .set({
              status: "completed" as any,
              report: generated.markdown,
              progressPercent: 100,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(researchSessions.id, sessionId));

          progress.publishSessionUpdate(companyId, sessionId, "completed", {
            message: "Research completed after retry",
            findingsCount: allFindings.length,
          });
        } else if (anyFailed) {
          // Some tasks still failed — mark session as failed
          await db
            .update(researchSessions)
            .set({
              status: "failed" as any,
              updatedAt: new Date(),
            })
            .where(eq(researchSessions.id, sessionId));

          progress.publishSessionUpdate(companyId, sessionId, "failed", {
            message: "Some tasks still failed after retry",
          });
        } else {
          // Still running (more tasks pending)
          await db
            .update(researchSessions)
            .set({
              status: "running" as any,
              updatedAt: new Date(),
            })
            .where(eq(researchSessions.id, sessionId));
        }
      } finally {
        runningSessions.delete(companyId);
        cancelFlags.delete(sessionId);
      }
    },

    /**
     * Resume a cancelled or failed research session.
     * Picks up from the last completed task.
     */
    async resumeSession(sessionId: string, companyId: string): Promise<void> {
      // Check concurrent session lock
      const existing = runningSessions.get(companyId);
      if (existing && existing !== sessionId) {
        throw new Error(`Another research session is already running for this company: ${existing}`);
      }

      // Set lock
      runningSessions.set(companyId, sessionId);
      cancelFlags.set(sessionId, false);

      try {
        await resumeRunSession(sessionId, companyId);
      } finally {
        runningSessions.delete(companyId);
        cancelFlags.delete(sessionId);
      }
    },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Main execution loop
  // ──────────────────────────────────────────────────────────────────────────

  async function runSession(sessionId: string, companyId: string): Promise<void> {
    logger.info({ sessionId, companyId }, "Research session starting");

    // 1. Fetch session
    const [session] = await db
      .select()
      .from(researchSessions)
      .where(
        and(
          eq(researchSessions.id, sessionId),
          eq(researchSessions.companyId, companyId)
        )
      )
      .limit(1);

    if (!session) {
      throw new Error("Research session not found");
    }

    // 2. Transition to running
    await db
      .update(researchSessions)
      .set({
        status: "running" as any,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(researchSessions.id, sessionId));

    progress.publishSessionUpdate(companyId, sessionId, "running", {
      message: "Research started",
    });

    try {
      // 3. Generate plan (or reuse existing)
      let plan = session.plan as {
        strategy: string;
        subtopics: Array<{ id: string; title: string; description: string; priority: number }>;
      } | null;

      if (!plan || !plan.subtopics || plan.subtopics.length === 0) {
        plan = await generateResearchPlan(
          session.query,
          session.maxSubtopics,
          session.depth,
          { model: config.researchLlmModel, apiKey: config.researchLlmApiKey }
        );

        // Save plan
        await db
          .update(researchSessions)
          .set({ plan: plan as any, updatedAt: new Date() })
          .where(eq(researchSessions.id, sessionId));
      }

      // Check cancellation
      if (isCancelled(sessionId)) {
        await completeCancellation(sessionId, companyId);
        return;
      }

      // 4. Create tasks from plan
      const subtopics = plan.subtopics.slice(0, session.maxSubtopics);
      for (let i = 0; i < subtopics.length; i++) {
        const subtopic = subtopics[i];
        await db.insert(researchTasks).values({
          sessionId,
          companyId,
          title: subtopic.title,
          sequenceOrder: i,
          status: "pending" as any,
        });
      }

      logger.info(
        { sessionId, taskCount: subtopics.length },
        "Research tasks created"
      );

      // 5. Execute each task
      const tasks = await db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.sessionId, sessionId))
        .orderBy(researchTasks.sequenceOrder);

      for (const task of tasks) {
        if (isCancelled(sessionId)) {
          await completeCancellation(sessionId, companyId);
          return;
        }

        await executeTask(task.id, sessionId, companyId, task.title);
        await progress.updateProgress(sessionId, companyId);
      }

      // 6. Generate report
      const allFindings = await db
        .select()
        .from(researchFindings)
        .where(eq(researchFindings.sessionId, sessionId))
        .orderBy(researchFindings.createdAt);

      const reportFindings = allFindings.map((f) => ({
        content: f.content,
        category: f.category || "General",
        confidence: f.confidence || "medium",
        sourceUrl: f.sourceUrl,
        sourceTitle: f.sourceTitle,
        sourceDomain: f.sourceDomain,
      }));

      const generated = await generateResearchReport(
        session.query,
        reportFindings,
        { model: config.researchLlmModel, apiKey: config.researchLlmApiKey }
      );

      const report = generated.markdown;

      // 7. Mark completed
      await db
        .update(researchSessions)
        .set({
          status: "completed" as any,
          report,
          progressPercent: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(researchSessions.id, sessionId));

      progress.publishSessionUpdate(companyId, sessionId, "completed", {
        message: "Research completed",
        findingsCount: allFindings.length,
        sourcesCount: generated.sources.length,
      });

      logger.info(
        { sessionId, findingsCount: allFindings.length },
        "Research session completed"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ sessionId, error: message }, "Research session failed");

      await db
        .update(researchSessions)
        .set({
          status: "failed" as any,
          updatedAt: new Date(),
        })
        .where(eq(researchSessions.id, sessionId));

      progress.publishSessionUpdate(companyId, sessionId, "failed", {
        error: message,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Resume session (pick up from where it was cancelled/failed)
  // ──────────────────────────────────────────────────────────────────────────

  async function resumeRunSession(sessionId: string, companyId: string): Promise<void> {
    logger.info({ sessionId, companyId }, "Research session resuming");

    // 1. Fetch session
    const [session] = await db
      .select()
      .from(researchSessions)
      .where(
        and(
          eq(researchSessions.id, sessionId),
          eq(researchSessions.companyId, companyId)
        )
      )
      .limit(1);

    if (!session) {
      throw new Error("Research session not found");
    }

    // Only allow resuming cancelled or failed sessions
    if (session.status !== "cancelled" && session.status !== "failed" && session.status !== "cancelling") {
      throw new Error(`Cannot resume session with status: ${session.status}`);
    }

    // 2. Transition to running
    await db
      .update(researchSessions)
      .set({
        status: "running" as any,
        updatedAt: new Date(),
      })
      .where(eq(researchSessions.id, sessionId));

    progress.publishSessionUpdate(companyId, sessionId, "running", {
      message: "Research resumed",
    });

    try {
      // 3. Find pending or failed tasks to resume
      const tasks = await db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.sessionId, sessionId))
        .orderBy(researchTasks.sequenceOrder);

      // Find the first task that is not completed
      let resumeFromIndex = 0;
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].status === "completed") {
          resumeFromIndex = i + 1;
        } else {
          break;
        }
      }

      // Execute remaining tasks
      for (let i = resumeFromIndex; i < tasks.length; i++) {
        if (isCancelled(sessionId)) {
          await completeCancellation(sessionId, companyId);
          return;
        }

        const task = tasks[i];
        await executeTask(task.id, sessionId, companyId, task.title);
        await progress.updateProgress(sessionId, companyId);
      }

      // 4. Generate report (reuse existing findings + new ones)
      const allFindings = await db
        .select()
        .from(researchFindings)
        .where(eq(researchFindings.sessionId, sessionId))
        .orderBy(researchFindings.createdAt);

      const reportFindings = allFindings.map((f) => ({
        content: f.content,
        category: f.category || "General",
        confidence: f.confidence || "medium",
        sourceUrl: f.sourceUrl,
        sourceTitle: f.sourceTitle,
        sourceDomain: f.sourceDomain,
      }));

      const generated = await generateResearchReport(
        session.query,
        reportFindings,
        { model: config.researchLlmModel, apiKey: config.researchLlmApiKey }
      );

      const report = generated.markdown;

      // 5. Mark completed
      await db
        .update(researchSessions)
        .set({
          status: "completed" as any,
          report,
          progressPercent: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(researchSessions.id, sessionId));

      progress.publishSessionUpdate(companyId, sessionId, "completed", {
        message: "Research completed (resumed)",
        findingsCount: allFindings.length,
        sourcesCount: generated.sources.length,
      });

      logger.info(
        { sessionId, findingsCount: allFindings.length },
        "Research session completed after resume"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ sessionId, error: message }, "Research session failed after resume");

      await db
        .update(researchSessions)
        .set({
          status: "failed" as any,
          updatedAt: new Date(),
        })
        .where(eq(researchSessions.id, sessionId));

      progress.publishSessionUpdate(companyId, sessionId, "failed", {
        error: message,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Task execution
  // ──────────────────────────────────────────────────────────────────────────

  async function executeTask(
    taskId: string,
    sessionId: string,
    companyId: string,
    taskTitle: string
  ): Promise<void> {
    logger.info({ taskId, taskTitle }, "Executing research task");

    // Mark task as running
    await db
      .update(researchTasks)
      .set({ status: "running" as any, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(researchTasks.id, taskId));

    progress.publishTaskUpdate(companyId, sessionId, taskId, "running", {
      title: taskTitle,
    });

    try {
      // Search for the task topic
      const searchResults = await searchProvider.search(
        taskTitle,
        config.researchMaxSearchResults
      );

      // Filter by quality score
      const qualityResults = filterSourcesByQuality(searchResults, 40);
      const resultsToProcess = qualityResults.length > 0 ? qualityResults : searchResults;

      // Track unique sources for this task
      const taskSources: Array<{ url: string; title: string; snippet: string; qualityScore?: number }> = [];
      let findingsCount = 0;

      for (const result of resultsToProcess.slice(0, config.researchMaxFindingsPerTask)) {
        if (isCancelled(sessionId)) break;

        // Publish source processing event
        progress.publishSourceProcessing(companyId, sessionId, taskId, result.url, result.title);

        // Store source (skip if already exists for this session+url)
        try {
          await db
            .insert(researchSources)
            .values({
              sessionId,
              companyId,
              url: result.url,
              title: result.title,
              domain: result.domain,
              reliabilityScore: result.qualityScore ?? confidenceToScore("medium"),
              accessCount: 1,
              lastAccessedAt: new Date(),
            });
        } catch {
          // Source already exists for this session+url, ignore
        }

        taskSources.push({
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          qualityScore: result.qualityScore,
        });

        // Fetch real page content for richer findings
        let contentToAnalyze = result.snippet;
        const pageContent = await fetchPageContent(result.url);
        if (pageContent) {
          contentToAnalyze = pageContent;
        }

        // Extract findings from content
        const findings = await extractFindingsFromContent(
          taskTitle,
          result.title,
          contentToAnalyze,
          { model: config.researchLlmModel, apiKey: config.researchLlmApiKey }
        );

        for (const finding of findings) {
          await db.insert(researchFindings).values({
            taskId,
            sessionId,
            companyId,
            content: finding.content,
            sourceUrl: result.url,
            sourceTitle: result.title,
            sourceDomain: result.domain,
            confidence: finding.confidence as any,
            category: finding.category,
            reliabilityScore: result.qualityScore ?? confidenceToScore(finding.confidence),
          });

          findingsCount++;
          progress.publishFindingCreated(companyId, sessionId, taskId, {
            content: finding.content.slice(0, 100),
            category: finding.category,
          });
        }

        // Publish finding progress after each source
        progress.publishFindingProgress(
          companyId,
          sessionId,
          taskId,
          findingsCount,
          taskSources.length,
          { currentSource: result.title }
        );
      }

      // Update task with summary
      await db
        .update(researchTasks)
        .set({
          status: "completed" as any,
          findingsSummary: `Found ${findingsCount} finding(s) from ${taskSources.length} source(s)`,
          sources: taskSources as any,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(researchTasks.id, taskId));

      progress.publishTaskUpdate(companyId, sessionId, taskId, "completed", {
        findingsCount,
        sourcesCount: taskSources.length,
      });

      logger.info({ taskId, findingsCount, sourcesCount: taskSources.length }, "Task completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ taskId, error: message }, "Task failed");

      await db
        .update(researchTasks)
        .set({
          status: "failed" as any,
          findingsSummary: `Error: ${message}`,
          updatedAt: new Date(),
        })
        .where(eq(researchTasks.id, taskId));

      progress.publishTaskUpdate(companyId, sessionId, taskId, "failed", {
        error: message,
      });

      // Re-throw to fail the entire session
      throw new Error(`Task failed: ${message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cancellation helpers
  // ──────────────────────────────────────────────────────────────────────────

  function isCancelled(sessionId: string): boolean {
    return cancelFlags.get(sessionId) === true;
  }

  async function completeCancellation(sessionId: string, companyId: string): Promise<void> {
    logger.info({ sessionId }, "Research session cancelled");

    await db
      .update(researchSessions)
      .set({
        status: "cancelled" as any,
        updatedAt: new Date(),
      })
      .where(eq(researchSessions.id, sessionId));

    progress.publishSessionUpdate(companyId, sessionId, "cancelled", {
      message: "Research cancelled by user",
      cancelled: true,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function confidenceToScore(confidence: string | number): number {
  if (typeof confidence === "number") return Math.min(100, Math.max(0, confidence));
  switch (confidence) {
    case "high":
      return 90;
    case "medium":
      return 60;
    case "low":
      return 30;
    default:
      return 50;
  }
}
