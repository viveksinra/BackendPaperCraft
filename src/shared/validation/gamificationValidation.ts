import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

// ─── Config Schemas ────────────────────────────────────────────────────────

const pointRuleSchema = z.object({
  action: z.string().min(1).max(100),
  points: z.number().int().min(0).max(10000),
  maxPerDay: z.number().int().min(0).max(100).default(0),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

const levelDefinitionSchema = z.object({
  level: z.number().int().min(1).max(100),
  name: z.string().min(1).max(100),
  pointsRequired: z.number().int().min(0),
  icon: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
});

const badgeCriteriaSchema = z.object({
  type: z.enum(["count", "streak", "points", "level"]),
  threshold: z.number().int().min(0),
  field: z.string().max(200).optional(),
});

export const updateConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  pointRules: z.array(pointRuleSchema).min(1).max(50).optional(),
  levels: z.array(levelDefinitionSchema).min(1).max(20).optional(),
  streakConfig: z
    .object({
      requiredActivities: z.array(z.string().max(100)).max(20).optional(),
      gracePeriodHours: z.number().int().min(0).max(168).optional(),
      milestones: z
        .array(
          z.object({
            days: z.number().int().min(1),
            bonusPoints: z.number().int().min(0).default(0),
            badgeId: z.string().max(100).optional(),
          })
        )
        .max(20)
        .optional(),
    })
    .optional(),
  leaderboardConfig: z
    .object({
      enabled: z.boolean().optional(),
      resetFrequency: z.enum(["weekly", "monthly", "term", "never"]).optional(),
      showTopN: z.number().int().min(5).max(200).optional(),
      anonymizeRanks: z.boolean().optional(),
      minParticipants: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

export const addBadgeSchema = z.object({
  badgeId: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  tier: z.enum(["bronze", "silver", "gold", "platinum"]).optional(),
  criteria: badgeCriteriaSchema,
});

export const updateBadgeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  tier: z.enum(["bronze", "silver", "gold", "platinum"]).optional(),
  criteria: badgeCriteriaSchema.optional(),
  isActive: z.boolean().optional(),
});

// ─── Student/Leaderboard Schemas ───────────────────────────────────────────

export const leaderboardSchema = z.object({
  period: z.enum(["all_time", "weekly", "monthly"]).default("all_time"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  classId: oid.optional(),
});

export const pointsHistorySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const manualAwardSchema = z.object({
  studentUserId: oid,
  points: z.number().int().min(1).max(10000),
  description: z.string().min(1).max(500),
});
