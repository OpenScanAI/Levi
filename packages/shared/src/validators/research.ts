import { z } from "zod";

export const researchSessionStatusSchema = z.enum([
  "planning",
  "running",
  "cancelling",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const researchDepthSchema = z.enum(["shallow", "medium", "deep"]);

export const createResearchSessionSchema = z.object({
  title: z.string().min(1).max(200),
  query: z.string().min(1).max(2000),
  depth: researchDepthSchema.optional().default("medium"),
  maxSubtopics: z.number().int().min(1).max(20).optional().default(5),
  plan: z.record(z.unknown()).optional(),
});

export const updateResearchSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(2000).optional(),
  depth: researchDepthSchema.optional(),
  maxSubtopics: z.number().int().min(1).max(20).optional(),
  status: researchSessionStatusSchema.optional(),
  report: z.string().optional(),
  isEdited: z.boolean().optional(),
});

export const generateSubtopicsSchema = z.object({
  query: z.string().min(1).max(2000),
  depth: researchDepthSchema.optional().default("medium"),
  maxSubtopics: z.number().int().min(1).max(20).optional().default(5),
});

export const researchTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const createResearchTaskSchema = z.object({
  title: z.string().min(1).max(500),
  sequenceOrder: z.number().int().min(0).optional().default(0),
});

export const updateResearchTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: researchTaskStatusSchema.optional(),
  findingsSummary: z.string().optional(),
  sources: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        snippet: z.string().optional(),
      })
    )
    .optional(),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
});

export const researchFindingConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const createResearchFindingSchema = z.object({
  taskId: z.string().uuid(),
  sessionId: z.string().uuid(),
  content: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceDomain: z.string().optional(),
  confidence: researchFindingConfidenceSchema.optional().default("medium"),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
  category: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const markDuplicateSchema = z.object({
  duplicateOfId: z.string().uuid(),
});

export const createResearchMemorySchema = z.object({
  key: z.string().min(1).max(200),
  value: z.record(z.unknown()),
  sessionId: z.string().uuid().optional(),
  sourceFindingId: z.string().uuid().optional(),
});

export type CreateResearchSession = z.infer<typeof createResearchSessionSchema>;
export type UpdateResearchSession = z.infer<typeof updateResearchSessionSchema>;
export type GenerateSubtopics = z.infer<typeof generateSubtopicsSchema>;
export type CreateResearchTask = z.infer<typeof createResearchTaskSchema>;
export type UpdateResearchTask = z.infer<typeof updateResearchTaskSchema>;
export type CreateResearchFinding = z.infer<typeof createResearchFindingSchema>;
export type MarkDuplicate = z.infer<typeof markDuplicateSchema>;
export type CreateResearchMemory = z.infer<typeof createResearchMemorySchema>;
