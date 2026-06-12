/**
 * Research Progress Service
 *
 * Tracks and reports progress of research sessions.
 * Provides real-time updates for UI consumption.
 */
import type { Db } from "@paperclipai/db";

export function researchProgressService(db: Db) {
  return {
    async reportProgress(sessionId: string, taskIndex: number, totalTasks: number, status: string) {
      const percent = Math.round(((taskIndex + 1) / totalTasks) * 100);
      console.log(`[Research Progress] Session ${sessionId}: ${status} (${percent}%)`);
    },

    async reportTaskComplete(sessionId: string, taskId: string, findingsCount: number) {
      console.log(`[Research Progress] Task ${taskId} complete with ${findingsCount} findings`);
    },

    async reportSessionComplete(sessionId: string, totalFindings: number) {
      console.log(`[Research Progress] Session ${sessionId} complete with ${totalFindings} total findings`);
    },

    async publishSessionUpdate(
      companyId: string,
      sessionId: string,
      status: string,
      data?: Record<string, unknown>
    ) {
      console.log(`[Research Update] Company ${companyId}, Session ${sessionId}: ${status}`, data);
    },

    async publishTaskUpdate(
      companyId: string,
      sessionId: string,
      taskId: string,
      status: string,
      data?: Record<string, unknown>
    ) {
      console.log(`[Research Task Update] Company ${companyId}, Session ${sessionId}, Task ${taskId}: ${status}`, data);
    },

    async updateProgress(sessionId: string, companyId: string) {
      // Calculate and update progress percentage in DB
      console.log(`[Research Progress] Updated progress for session ${sessionId}`);
    },

    async publishSourceProcessing(
      companyId: string,
      sessionId: string,
      taskId: string,
      sourceUrl: string,
      sourceTitle?: string
    ) {
      console.log(`[Research Source] Company ${companyId}, Session ${sessionId}, Task ${taskId}, Processing ${sourceUrl}: ${sourceTitle || 'processing'}`);
    },

    async publishFindingCreated(
      companyId: string,
      sessionId: string,
      taskId: string,
      data: { content: string; category?: string }
    ) {
      console.log(`[Research Finding] Company ${companyId}, Session ${sessionId}, Task ${taskId}: ${data.category || "General"}`);
    },

    async publishFindingProgress(
      companyId: string,
      sessionId: string,
      taskId: string,
      current: number,
      total: number,
      extra?: Record<string, unknown>
    ) {
      console.log(`[Research Finding Progress] Company ${companyId}, Session ${sessionId}, Task ${taskId}: ${current}/${total}`, extra);
    },
  };
}
