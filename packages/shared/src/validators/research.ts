import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Research Enums
// ─────────────────────────────────────────────────────────────────────────────

export const researchSessionStatusSchema = z.enum([
  "planning",
  "running",
  "cancelling",
  "paused",
  "completed",
  "failed",
]);

export const researchTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const researchFindingConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const researchDepthSchema = z.enum([
  "shallow",
  "medium",
  "deep",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Research Source Snippet
// ─────────────────────────────────────────────────────────────────────────────

export const researchSourceSnippetSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Research Plan
// ─────────────────────────────────────────────────────────────────────────────

export const researchSubtopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.number().int(),
});

export const researchPlanSchema = z.object({
  subtopics: z.array(researchSubtopicSchema),
  strategy: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create / Update Requests
// ─────────────────────────────────────────────────────────────────────────────

export const createResearchSessionSchema = z.object({
  title: z.string().min(1).max(200),
  query: z.string().min(1).max(2000),
  depth: researchDepthSchema.optional(),
  maxSubtopics: z.number().int().min(1).max(20).optional(),
  plan: researchPlanSchema.optional(),
});

export const generateSubtopicsSchema = z.object({
  query: z.string().min(1).max(2000),
  depth: researchDepthSchema.optional(),
  maxSubtopics: z.number().int().min(1).max(20).optional(),
});

export const updateResearchSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(2000).optional(),
  status: researchSessionStatusSchema.optional(),
  depth: researchDepthSchema.optional(),
  maxSubtopics: z.number().int().min(1).max(20).optional(),
  report: z.string().optional(),
});

export const createResearchTaskSchema = z.object({
  title: z.string().min(1).max(200),
  sequenceOrder: z.number().int().optional(),
});

export const updateResearchTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: researchTaskStatusSchema.optional(),
  findingsSummary: z.string().optional(),
  sources: z.array(researchSourceSnippetSchema).optional(),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
});

export const createResearchFindingSchema = z.object({
  taskId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().optional(),
  sourceDomain: z.string().optional(),
  confidence: researchFindingConfidenceSchema.optional(),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
  category: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const markDuplicateSchema = z.object({
  duplicateOfId: z.string().uuid(),
});

export const createResearchMemorySchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  sessionId: z.string().uuid().optional(),
  sourceFindingId: z.string().uuid().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────────────────

export type CreateResearchSession = z.infer<typeof createResearchSessionSchema>;
export type GenerateSubtopicsRequest = z.infer<typeof generateSubtopicsSchema>;
export type UpdateResearchSession = z.infer<typeof updateResearchSessionSchema>;
export type CreateResearchTask = z.infer<typeof createResearchTaskSchema>;
export type UpdateResearchTask = z.infer<typeof updateResearchTaskSchema>;
export type CreateResearchFinding = z.infer<typeof createResearchFindingSchema>;
export type MarkDuplicate = z.infer<typeof markDuplicateSchema>;
export type CreateResearchMemory = z.infer<typeof createResearchMemorySchema>;
