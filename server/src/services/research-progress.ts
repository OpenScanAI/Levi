/**
 * Research Progress Service
 *
 * Tracks session progress and publishes live events for real-time UI updates.
 */
import type { Db } from "@paperclipai/db";
import { researchSessions, researchTasks } from "@paperclipai/db";
import { and, eq, count } from "drizzle-orm";
import { publishLiveEvent } from "./live-events.js";

export interface ProgressState {
  sessionId: string;
  companyId: string;
  totalTasks: number;
  completedTasks: number;
  currentTaskTitle?: string;
  status: string;
  message: string;
}

export function researchProgressService(db: Db) {
  return {
    /**
     * Update session progress percentage based on completed tasks.
     */
    async updateProgress(sessionId: string, companyId: string): Promise<number> {
      const [taskStats] = await db
        .select({ total: count(), completed: count() })
        .from(researchTasks)
        .where(eq(researchTasks.sessionId, sessionId));

      // Count completed tasks separately
      const [completedResult] = await db
        .select({ count: count() })
        .from(researchTasks)
        .where(
          and(
            eq(researchTasks.sessionId, sessionId),
            eq(researchTasks.status, "completed")
          )
        );

      const total = Number(taskStats?.total ?? 0);
      const completed = Number(completedResult?.count ?? 0);
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      await db
        .update(researchSessions)
        .set({ progressPercent: percent, updatedAt: new Date() })
        .where(
          and(
            eq(researchSessions.id, sessionId),
            eq(researchSessions.companyId, companyId)
          )
        );

      return percent;
    },

    /**
     * Publish a live event for research session status changes.
     */
    publishSessionUpdate(
      companyId: string,
      sessionId: string,
      status: string,
      payload?: Record<string, unknown>
    ) {
      publishLiveEvent({
        companyId,
        type: "research.session.status",
        payload: {
          sessionId,
          status,
          ...payload,
        },
      });
    },

    /**
     * Publish a live event when a task is updated.
     */
    publishTaskUpdate(
      companyId: string,
      sessionId: string,
      taskId: string,
      status: string,
      payload?: Record<string, unknown>
    ) {
      publishLiveEvent({
        companyId,
        type: "research.task.updated",
        payload: {
          sessionId,
          taskId,
          status,
          ...payload,
        },
      });
    },

    /**
     * Publish a live event when a finding is created.
     */
    publishFindingCreated(
      companyId: string,
      sessionId: string,
      findingId: string,
      payload?: Record<string, unknown>
    ) {
      publishLiveEvent({
        companyId,
        type: "research.finding.created",
        payload: {
          sessionId,
          findingId,
          ...payload,
        },
      });
    },

    /**
     * Publish a live event when a source is being processed.
     */
    publishSourceProcessing(
      companyId: string,
      sessionId: string,
      taskId: string,
      sourceUrl: string,
      sourceTitle: string,
      payload?: Record<string, unknown>
    ) {
      publishLiveEvent({
        companyId,
        type: "research.source.processing",
        payload: {
          sessionId,
          taskId,
          sourceUrl,
          sourceTitle,
          ...payload,
        },
      });
    },

    /**
     * Publish a live event with current finding count during task execution.
     */
    publishFindingProgress(
      companyId: string,
      sessionId: string,
      taskId: string,
      findingsCount: number,
      totalSources: number,
      payload?: Record<string, unknown>
    ) {
      publishLiveEvent({
        companyId,
        type: "research.finding.progress",
        payload: {
          sessionId,
          taskId,
          findingsCount,
          totalSources,
          ...payload,
        },
      });
    },

    /**
     * Get current progress state for a session.
     */
    async getProgressState(
      sessionId: string,
      companyId: string
    ): Promise<ProgressState> {
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

      const tasks = await db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.sessionId, sessionId))
        .orderBy(researchTasks.sequenceOrder);

      const completedTasks = tasks.filter((t) => t.status === "completed").length;
      const currentTask = tasks.find((t) => t.status === "running");

      return {
        sessionId,
        companyId,
        totalTasks: tasks.length,
        completedTasks,
        currentTaskTitle: currentTask?.title,
        status: session?.status ?? "unknown",
        message: `${completedTasks}/${tasks.length} tasks completed`,
      };
    },
  };
}
