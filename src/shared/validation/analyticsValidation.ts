import { z } from "zod";

// ─── Analytics query (common) ───────────────────────────────────────────────

export const analyticsQuerySchema = z.object({
  period: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  forceRefresh: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// ─── Class test analytics ───────────────────────────────────────────────────

export const classTestAnalyticsSchema = z.object({
  testId: z
    .string()
    .length(24)
    .regex(/^[0-9a-fA-F]{24}$/),
});

export type ClassTestAnalytics = z.infer<typeof classTestAnalyticsSchema>;

// ─── Topic drilldown ────────────────────────────────────────────────────────

export const topicDrilldownSchema = z.object({
  subjectId: z
    .string()
    .length(24)
    .regex(/^[0-9a-fA-F]{24}$/),
});

export type TopicDrilldown = z.infer<typeof topicDrilldownSchema>;

// ─── Question analytics filter ──────────────────────────────────────────────

export const questionAnalyticsFilterSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard", "expert"]).optional(),
  actualDifficulty: z.enum(["easy", "medium", "hard", "expert"]).optional(),
  discriminationMin: z.coerce.number().min(-1).max(1).optional(),
  discriminationMax: z.coerce.number().min(-1).max(1).optional(),
  accuracyMin: z.coerce.number().min(0).max(100).optional(),
  accuracyMax: z.coerce.number().min(0).max(100).optional(),
  subjectId: z
    .string()
    .length(24)
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  sortBy: z
    .enum(["accuracy", "discrimination", "usage", "time"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type QuestionAnalyticsFilter = z.infer<
  typeof questionAnalyticsFilterSchema
>;
