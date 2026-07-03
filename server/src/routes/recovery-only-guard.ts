import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { heartbeatService } from "../services/heartbeat.js";
import { forbidden } from "../errors.js";

export function recoveryOnlyGuard(db: Db) {
  const heartbeat = heartbeatService(db);

  return async (req: Request) => {
    const runId = req.actor.runId;
    if (!runId) return;

    let isRecoveryOnly: boolean;
    try {
      isRecoveryOnly = await heartbeat.isRecoveryOnlyRun(runId);
    } catch (error) {
      // If the heartbeat service is unavailable (e.g. test mocks) do not block
      // the request; the guard is only meaningful when run state can be queried.
      return;
    }
    if (isRecoveryOnly) {
      throw forbidden(
        "This run is in recovery-only mode and cannot perform deliverable writes. " +
          "Set adapterConfig.fallback.allowDeliverables to true to override.",
      );
    }
  };
}

export function createRecoveryOnlyWriteGuard(db: Db) {
  const guard = recoveryOnlyGuard(db);
  return async (req: Request, _res: unknown, next: () => void) => {
    await guard(req);
    next();
  };
}
