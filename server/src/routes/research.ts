import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createResearchSessionSchema,
  updateResearchSessionSchema,
  generateSubtopicsSchema,
  createResearchTaskSchema,
  updateResearchTaskSchema,
  createResearchFindingSchema,
  markDuplicateSchema,
  createResearchMemorySchema,
} from "@paperclipai/shared";
import { researchService } from "../services/research.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";
import type { Config } from "../config.js";

export function researchRoutes(db: Db, config?: Partial<Config>) {
  const router = Router();
  const svc = researchService(db, config as Config | undefined);

  // ────────────────────────────────────────────────────────────────────────────
  // Sessions
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/sessions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const result = await svc.listSessions(companyId, { status, limit, offset });
    res.json(result);
  });

  router.post("/companies/:companyId/research/sessions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = createResearchSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const actorId = req.actor.type === "board" ? req.actor.userId ?? "unknown" : req.actor.agentId ?? "agent";
    const session = await svc.createSession(companyId, actorId, parsed.data);
    res.status(201).json(session);
  });

  router.get("/companies/:companyId/research/sessions/:sessionId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const session = await svc.getSession(companyId, sessionId);
    res.json(session);
  });

  router.patch("/companies/:companyId/research/sessions/:sessionId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const parsed = updateResearchSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const session = await svc.updateSession(companyId, sessionId, parsed.data);
    res.json(session);
  });

  router.delete("/companies/:companyId/research/sessions/:sessionId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    await svc.deleteSession(companyId, sessionId);
    res.status(204).send();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Engine
  // ────────────────────────────────────────────────────────────────────────────

  router.post("/companies/:companyId/research/sessions/:sessionId/start", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.startSession(companyId, sessionId);
    res.json(result);
  });

  router.post("/companies/:companyId/research/generate-subtopics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = generateSubtopicsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const result = await svc.generateSubtopics(parsed.data);
    res.json(result);
  });

  router.post("/companies/:companyId/research/sessions/:sessionId/cancel", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.cancelSession(companyId, sessionId);
    res.json(result);
  });

  router.post("/companies/:companyId/research/sessions/:sessionId/resume", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.resumeSession(companyId, sessionId);
    res.json(result);
  });

  router.post("/companies/:companyId/research/sessions/:sessionId/tasks/:taskId/retry", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    const taskId = req.params.taskId as string;
    assertCompanyAccess(req, companyId);

    const result = await svc.retryTask(companyId, sessionId, taskId);
    res.json(result);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Tasks
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/sessions/:sessionId/tasks", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const tasks = await svc.listTasks(companyId, sessionId);
    res.json(tasks);
  });

  router.post("/companies/:companyId/research/sessions/:sessionId/tasks", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const parsed = createResearchTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const task = await svc.createTask(companyId, sessionId, parsed.data);
    res.status(201).json(task);
  });

  router.get("/companies/:companyId/research/tasks/:taskId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const taskId = req.params.taskId as string;
    assertCompanyAccess(req, companyId);

    const task = await svc.getTask(companyId, taskId);
    res.json(task);
  });

  router.patch("/companies/:companyId/research/tasks/:taskId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const taskId = req.params.taskId as string;
    assertCompanyAccess(req, companyId);

    const parsed = updateResearchTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const task = await svc.updateTask(companyId, taskId, parsed.data);
    res.json(task);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Findings
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/tasks/:taskId/findings", async (req, res) => {
    const companyId = req.params.companyId as string;
    const taskId = req.params.taskId as string;
    assertCompanyAccess(req, companyId);

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const result = await svc.listFindings(companyId, { taskId, limit, offset });
    res.json(result);
  });

  router.post("/companies/:companyId/research/findings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = createResearchFindingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const finding = await svc.createFinding(companyId, parsed.data);
    res.status(201).json(finding);
  });

  router.post("/companies/:companyId/research/findings/:findingId/mark-duplicate", async (req, res) => {
    const companyId = req.params.companyId as string;
    const findingId = req.params.findingId as string;
    assertCompanyAccess(req, companyId);

    const parsed = markDuplicateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const finding = await svc.markDuplicate(companyId, findingId, parsed.data.duplicateOfId);
    res.json(finding);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Sources
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/sessions/:sessionId/sources", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    assertCompanyAccess(req, companyId);

    const sources = await svc.getSources(companyId, sessionId);
    res.json(sources);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Memory
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/memory", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const key = req.query.key as string | undefined;
    const memory = await svc.getMemory(companyId, key);
    res.json(memory);
  });

  router.post("/companies/:companyId/research/memory", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const parsed = createResearchMemorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid request body", parsed.error.format());
    }

    const memory = await svc.setMemory(companyId, parsed.data);
    res.status(201).json(memory);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/research/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const dashboard = await svc.getDashboard(companyId);
    res.json(dashboard);
  });

  return router;
}
