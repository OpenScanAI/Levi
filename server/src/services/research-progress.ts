/**
 * Research Progress Service (Stub)
 *
 * Tracks and reports progress of research sessions.
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
  };
}
