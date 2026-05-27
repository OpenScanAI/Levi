import { logger } from "../middleware/logger.js";
import type { MemoryService } from "./MemoryService.js";

export interface MemoryLifecycle {
  onCompanyDeleted(input: { companyId: string; actorId: string; mode?: "deleted" | "archived" }): Promise<void>;
  onProjectDeleted(input: { companyId: string; projectId: string; actorId: string }): Promise<void>;
}

export function createMemoryLifecycle(memoryService: MemoryService): MemoryLifecycle {
  return {
    async onCompanyDeleted({ companyId, actorId, mode }): Promise<void> {
      if (!memoryService.enabled) {
        logger.debug({ companyId, actorId, mode }, "Memory service disabled; skipping company purge");
        return;
      }

      try {
        await memoryService.purgeCompany(companyId);
        logger.info({
          audit: true,
          event: "memory.company_purged",
          companyId,
          actorId,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn({ err, companyId, actorId, mode }, "Memory company purge failed");
      }
    },

    async onProjectDeleted({ companyId, projectId, actorId }): Promise<void> {
      if (!memoryService.enabled) {
        logger.debug({ companyId, projectId, actorId }, "Memory service disabled; skipping project purge");
        return;
      }

      try {
        await memoryService.purgeProject(companyId, projectId);
        logger.info({
          audit: true,
          event: "memory.project_purged",
          companyId,
          projectId,
          actorId,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn({ err, companyId, projectId, actorId }, "Memory project purge failed");
      }
    },
  };
}
