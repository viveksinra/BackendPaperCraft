import { Types } from "mongoose";
import {
  GamificationConfigModel,
  GamificationConfigDocument,
} from "../models/gamificationConfig";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// ─── 1. Get or Create Config ───────────────────────────────────────────────

export async function getOrCreateConfig(
  tenantId: string,
  companyId: string,
  createdBy: string = "system"
): Promise<GamificationConfigDocument> {
  const companyOid = toObjectId(companyId);

  let config = await GamificationConfigModel.findOne({ tenantId, companyId: companyOid });

  if (!config) {
    config = await GamificationConfigModel.create({
      tenantId,
      companyId: companyOid,
      createdBy: createdBy.toLowerCase(),
      updatedBy: createdBy.toLowerCase(),
    });
    logger.info({ msg: "Created default gamification config", companyId });
  }

  return config;
}

// ─── 2. Update Config ──────────────────────────────────────────────────────

export async function updateConfig(
  tenantId: string,
  companyId: string,
  updates: {
    isEnabled?: boolean;
    pointRules?: Array<{
      action: string;
      points: number;
      maxPerDay?: number;
      description?: string;
      isActive?: boolean;
    }>;
    levels?: Array<{
      level: number;
      name: string;
      pointsRequired: number;
      icon?: string;
      color?: string;
    }>;
    streakConfig?: {
      requiredActivities?: string[];
      gracePeriodHours?: number;
      milestones?: Array<{ days: number; bonusPoints: number; badgeId?: string }>;
    };
    leaderboardConfig?: {
      enabled?: boolean;
      resetFrequency?: string;
      showTopN?: number;
      anonymizeRanks?: boolean;
      minParticipants?: number;
    };
  },
  updatedBy: string
): Promise<GamificationConfigDocument> {
  const config = await getOrCreateConfig(tenantId, companyId, updatedBy);

  if (updates.isEnabled !== undefined) config.isEnabled = updates.isEnabled;
  if (updates.pointRules) config.pointRules = updates.pointRules as any;
  if (updates.levels) {
    // Ensure levels are sorted by pointsRequired
    config.levels = updates.levels
      .sort((a, b) => a.pointsRequired - b.pointsRequired) as any;
  }
  if (updates.streakConfig) {
    Object.assign(config.streakConfig, updates.streakConfig);
  }
  if (updates.leaderboardConfig) {
    Object.assign(config.leaderboardConfig, updates.leaderboardConfig);
  }

  config.updatedBy = updatedBy.toLowerCase();
  await config.save();

  logger.info({ msg: "Gamification config updated", companyId });
  return config;
}

// ─── 3. Add Badge Definition ───────────────────────────────────────────────

export async function addBadge(
  tenantId: string,
  companyId: string,
  badge: {
    badgeId: string;
    name: string;
    description?: string;
    icon?: string;
    tier?: "bronze" | "silver" | "gold" | "platinum";
    criteria: { type: string; threshold: number; field: string };
  },
  updatedBy: string
): Promise<GamificationConfigDocument> {
  const config = await getOrCreateConfig(tenantId, companyId, updatedBy);

  const exists = config.badges.find((b) => b.badgeId === badge.badgeId);
  if (exists) {
    throw Object.assign(new Error("Badge ID already exists"), { status: 409 });
  }

  config.badges.push({
    badgeId: badge.badgeId,
    name: badge.name,
    description: badge.description || "",
    icon: badge.icon || "",
    tier: badge.tier || "bronze",
    criteria: badge.criteria,
    isActive: true,
  });

  config.updatedBy = updatedBy.toLowerCase();
  await config.save();
  return config;
}

// ─── 4. Update Badge ──────────────────────────────────────────────────────

export async function updateBadge(
  tenantId: string,
  companyId: string,
  badgeId: string,
  updates: {
    name?: string;
    description?: string;
    icon?: string;
    tier?: "bronze" | "silver" | "gold" | "platinum";
    criteria?: { type: string; threshold: number; field: string };
    isActive?: boolean;
  },
  updatedBy: string
): Promise<GamificationConfigDocument> {
  const config = await getOrCreateConfig(tenantId, companyId, updatedBy);

  const badge = config.badges.find((b) => b.badgeId === badgeId);
  if (!badge) {
    throw Object.assign(new Error("Badge not found"), { status: 404 });
  }

  if (updates.name !== undefined) badge.name = updates.name;
  if (updates.description !== undefined) badge.description = updates.description;
  if (updates.icon !== undefined) badge.icon = updates.icon;
  if (updates.tier !== undefined) badge.tier = updates.tier;
  if (updates.criteria !== undefined) badge.criteria = updates.criteria;
  if (updates.isActive !== undefined) badge.isActive = updates.isActive;

  config.updatedBy = updatedBy.toLowerCase();
  await config.save();
  return config;
}

// ─── 5. Delete Badge ──────────────────────────────────────────────────────

export async function deleteBadge(
  tenantId: string,
  companyId: string,
  badgeId: string,
  updatedBy: string
): Promise<GamificationConfigDocument> {
  const config = await getOrCreateConfig(tenantId, companyId, updatedBy);

  const idx = config.badges.findIndex((b) => b.badgeId === badgeId);
  if (idx === -1) {
    throw Object.assign(new Error("Badge not found"), { status: 404 });
  }

  config.badges.splice(idx, 1);
  config.updatedBy = updatedBy.toLowerCase();
  await config.save();
  return config;
}

// ─── 6. Get Points for Action ──────────────────────────────────────────────

export async function getPointsForAction(
  tenantId: string,
  companyId: string,
  action: string
): Promise<{ points: number; maxPerDay: number }> {
  const config = await getOrCreateConfig(tenantId, companyId);

  if (!config.isEnabled) return { points: 0, maxPerDay: 0 };

  const rule = config.pointRules.find((r) => r.action === action && r.isActive);
  if (!rule) return { points: 0, maxPerDay: 0 };

  return { points: rule.points, maxPerDay: rule.maxPerDay };
}

// ─── 7. Get Level for Points ───────────────────────────────────────────────

export function getLevelForPoints(
  config: GamificationConfigDocument,
  totalPoints: number
): { level: number; name: string; pointsToNextLevel: number } {
  const levels = [...config.levels].sort(
    (a, b) => b.pointsRequired - a.pointsRequired
  );

  for (const lvl of levels) {
    if (totalPoints >= lvl.pointsRequired) {
      const nextLevel = config.levels.find(
        (l) => l.pointsRequired > lvl.pointsRequired
      );
      return {
        level: lvl.level,
        name: lvl.name,
        pointsToNextLevel: nextLevel
          ? nextLevel.pointsRequired - totalPoints
          : 0,
      };
    }
  }

  const first = config.levels[0];
  return {
    level: first?.level || 1,
    name: first?.name || "Beginner",
    pointsToNextLevel: first ? first.pointsRequired - totalPoints : 100,
  };
}
