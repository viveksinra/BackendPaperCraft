import { Types } from "mongoose";
import {
  StudentGamificationModel,
  StudentGamificationDocument,
  PointSource,
} from "../models/studentGamification";
import * as configService from "./gamificationConfigService";
import * as notificationService from "./notificationService";
import { StudentModel } from "../models/student";
import { emitToUser } from "../shared/socket/socketServer";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function daysBetween(d1: Date, d2: Date): number {
  const oneDay = 86400000;
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.floor(Math.abs(utc2 - utc1) / oneDay);
}

// ─── 1. Get or Create Student Gamification ─────────────────────────────────

export async function getOrCreateProfile(
  tenantId: string,
  companyId: string,
  studentUserId: string
): Promise<StudentGamificationDocument> {
  const companyOid = toObjectId(companyId);
  const userOid = toObjectId(studentUserId);

  let profile = await StudentGamificationModel.findOne({
    tenantId,
    companyId: companyOid,
    studentUserId: userOid,
  });

  if (!profile) {
    profile = await StudentGamificationModel.create({
      tenantId,
      companyId: companyOid,
      studentUserId: userOid,
    });
  }

  return profile;
}

// ─── 2. Award Points ──────────────────────────────────────────────────────

export interface AwardPointsResult {
  pointsAwarded: number;
  totalPoints: number;
  levelUp: boolean;
  newLevel: number;
  newLevelName: string;
  badgesEarned: string[];
}

export async function awardPoints(
  tenantId: string,
  companyId: string,
  studentUserId: string,
  source: PointSource,
  options: {
    description?: string;
    referenceType?: string;
    referenceId?: string;
  } = {}
): Promise<AwardPointsResult> {
  const config = await configService.getOrCreateConfig(tenantId, companyId);
  if (!config.isEnabled) {
    return {
      pointsAwarded: 0,
      totalPoints: 0,
      levelUp: false,
      newLevel: 1,
      newLevelName: "Beginner",
      badgesEarned: [],
    };
  }

  const { points, maxPerDay } = await configService.getPointsForAction(
    tenantId,
    companyId,
    source
  );

  if (points === 0) {
    const profile = await getOrCreateProfile(tenantId, companyId, studentUserId);
    return {
      pointsAwarded: 0,
      totalPoints: profile.totalPoints,
      levelUp: false,
      newLevel: profile.level,
      newLevelName: profile.levelName,
      badgesEarned: [],
    };
  }

  const profile = await getOrCreateProfile(tenantId, companyId, studentUserId);

  // Check daily cap
  if (maxPerDay > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = profile.pointHistory.filter(
      (p) => p.source === source && p.awardedAt >= today
    ).length;
    if (todayCount >= maxPerDay) {
      return {
        pointsAwarded: 0,
        totalPoints: profile.totalPoints,
        levelUp: false,
        newLevel: profile.level,
        newLevelName: profile.levelName,
        badgesEarned: [],
      };
    }
  }

  const oldLevel = profile.level;

  // Add points
  profile.totalPoints += points;
  profile.weeklyPoints += points;
  profile.monthlyPoints += points;

  // Add to history (keep last 500 entries)
  profile.pointHistory.push({
    source,
    points,
    description: options.description || "",
    referenceType: options.referenceType || "",
    referenceId: options.referenceId || "",
    awardedAt: new Date(),
  });
  if (profile.pointHistory.length > 500) {
    profile.pointHistory = profile.pointHistory.slice(-500);
  }

  // Update level
  const levelInfo = configService.getLevelForPoints(config, profile.totalPoints);
  profile.level = levelInfo.level;
  profile.levelName = levelInfo.name;
  profile.pointsToNextLevel = levelInfo.pointsToNextLevel;

  const levelUp = profile.level > oldLevel;

  // Update streak
  await updateStreak(profile, config, source);

  // Check badge criteria
  const badgesEarned = await checkAndAwardBadges(
    tenantId,
    companyId,
    studentUserId,
    profile,
    config,
    source
  );

  await profile.save();

  // Sync streak to student model
  await syncStreakToStudent(studentUserId, profile);

  // Emit real-time events
  emitToUser(studentUserId, "gamification:points", {
    source,
    points,
    totalPoints: profile.totalPoints,
    level: profile.level,
    levelName: profile.levelName,
  });

  if (levelUp) {
    emitToUser(studentUserId, "gamification:level-up", {
      level: profile.level,
      levelName: profile.levelName,
    });

    await notificationService.createNotification({
      tenantId,
      companyId,
      recipientId: studentUserId,
      type: "level_up",
      title: "Level Up!",
      body: `You've reached Level ${profile.level}: ${profile.levelName}!`,
      icon: "trophy",
    });
  }

  for (const badgeName of badgesEarned) {
    emitToUser(studentUserId, "gamification:badge-earned", {
      badgeName,
    });

    await notificationService.createNotification({
      tenantId,
      companyId,
      recipientId: studentUserId,
      type: "badge_earned",
      title: "Badge Earned!",
      body: `You've earned the "${badgeName}" badge!`,
      icon: "award",
    });
  }

  logger.info({
    msg: "Points awarded",
    studentUserId,
    source,
    points,
    totalPoints: profile.totalPoints,
    levelUp,
    badgesEarned,
  });

  return {
    pointsAwarded: points,
    totalPoints: profile.totalPoints,
    levelUp,
    newLevel: profile.level,
    newLevelName: profile.levelName,
    badgesEarned,
  };
}

// ─── 3. Update Streak ─────────────────────────────────────────────────────

async function updateStreak(
  profile: StudentGamificationDocument,
  config: any,
  source: string
): Promise<void> {
  const streakActivities = config.streakConfig.requiredActivities as string[];
  if (!streakActivities.includes(source)) return;

  const now = new Date();
  const lastActivity = profile.lastActivityDate;

  if (!lastActivity || !isSameDay(now, lastActivity)) {
    if (lastActivity) {
      const gap = daysBetween(now, lastActivity);
      const gracePeriodDays = Math.ceil(
        (config.streakConfig.gracePeriodHours || 24) / 24
      );

      if (gap <= gracePeriodDays) {
        profile.currentStreak += 1;
      } else {
        profile.currentStreak = 1;
      }
    } else {
      profile.currentStreak = 1;
    }

    if (profile.currentStreak > profile.longestStreak) {
      profile.longestStreak = profile.currentStreak;
    }

    profile.lastActivityDate = now;

    // Add to streak history (keep last 90 entries)
    profile.streakHistory.push({
      date: now,
      activityType: source,
      maintained: true,
    });
    if (profile.streakHistory.length > 90) {
      profile.streakHistory = profile.streakHistory.slice(-90);
    }

    // Check streak milestones
    const milestones = config.streakConfig.milestones || [];
    for (const milestone of milestones) {
      if (profile.currentStreak === milestone.days) {
        if (milestone.bonusPoints > 0) {
          profile.totalPoints += milestone.bonusPoints;
          profile.weeklyPoints += milestone.bonusPoints;
          profile.monthlyPoints += milestone.bonusPoints;
          profile.pointHistory.push({
            source: "streak_bonus" as PointSource,
            points: milestone.bonusPoints,
            description: `${milestone.days}-day streak bonus`,
            referenceType: "streak",
            referenceId: String(milestone.days),
            awardedAt: now,
          });
        }
      }
    }
  }
}

// ─── 4. Check and Award Badges ─────────────────────────────────────────────

async function checkAndAwardBadges(
  tenantId: string,
  companyId: string,
  studentUserId: string,
  profile: StudentGamificationDocument,
  config: any,
  latestSource: string
): Promise<string[]> {
  const earnedBadgeNames: string[] = [];

  for (const badge of config.badges) {
    if (!badge.isActive) continue;
    if (profile.badges.find((b: any) => b.badgeId === badge.badgeId)) continue;

    let earned = false;

    if (badge.criteria.type === "count") {
      const count = profile.pointHistory.filter(
        (p: any) => p.source === badge.criteria.field
      ).length;
      if (count >= badge.criteria.threshold) earned = true;
    } else if (badge.criteria.type === "streak") {
      if (profile.currentStreak >= badge.criteria.threshold) earned = true;
    } else if (badge.criteria.type === "points") {
      if (profile.totalPoints >= badge.criteria.threshold) earned = true;
    } else if (badge.criteria.type === "level") {
      if (profile.level >= badge.criteria.threshold) earned = true;
    }

    if (earned) {
      profile.badges.push({
        badgeId: badge.badgeId,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        tier: badge.tier,
        earnedAt: new Date(),
      });
      earnedBadgeNames.push(badge.name);
    }
  }

  return earnedBadgeNames;
}

// ─── 5. Sync streak to Student model ──────────────────────────────────────

async function syncStreakToStudent(
  studentUserId: string,
  profile: StudentGamificationDocument
): Promise<void> {
  try {
    await StudentModel.findOneAndUpdate(
      { userId: toObjectId(studentUserId) },
      {
        "stats.currentStreak": profile.currentStreak,
        "stats.longestStreak": profile.longestStreak,
        "stats.lastActivityAt": profile.lastActivityDate,
      }
    );
  } catch (err) {
    logger.warn({ msg: "Failed to sync streak to student model", studentUserId, err });
  }
}

// ─── 6. Get Leaderboard ───────────────────────────────────────────────────

export async function getLeaderboard(
  tenantId: string,
  companyId: string,
  params: {
    period?: "all_time" | "weekly" | "monthly";
    page?: number;
    pageSize?: number;
    classId?: string;
  } = {}
): Promise<{
  entries: Array<{
    rank: number;
    studentUserId: string;
    totalPoints: number;
    level: number;
    levelName: string;
    currentStreak: number;
  }>;
  total: number;
}> {
  const { period = "all_time", page = 1, pageSize = 50 } = params;

  const sortField =
    period === "weekly"
      ? "weeklyPoints"
      : period === "monthly"
        ? "monthlyPoints"
        : "totalPoints";

  const filter: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
  };

  const [entries, total] = await Promise.all([
    StudentGamificationModel.find(filter)
      .sort({ [sortField]: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("studentUserId totalPoints weeklyPoints monthlyPoints level levelName currentStreak")
      .lean(),
    StudentGamificationModel.countDocuments(filter),
  ]);

  const ranked = entries.map((entry: any, idx: number) => ({
    rank: (page - 1) * pageSize + idx + 1,
    studentUserId: String(entry.studentUserId),
    totalPoints:
      period === "weekly"
        ? entry.weeklyPoints
        : period === "monthly"
          ? entry.monthlyPoints
          : entry.totalPoints,
    level: entry.level,
    levelName: entry.levelName,
    currentStreak: entry.currentStreak,
  }));

  return { entries: ranked, total };
}

// ─── 7. Get Student Profile ───────────────────────────────────────────────

export async function getStudentProfile(
  tenantId: string,
  companyId: string,
  studentUserId: string
): Promise<StudentGamificationDocument> {
  return getOrCreateProfile(tenantId, companyId, studentUserId);
}

// ─── 8. Get Points History ────────────────────────────────────────────────

export async function getPointsHistory(
  tenantId: string,
  companyId: string,
  studentUserId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ history: any[]; total: number }> {
  const { page = 1, pageSize = 20 } = params;
  const profile = await getOrCreateProfile(tenantId, companyId, studentUserId);

  const sorted = [...profile.pointHistory].sort(
    (a, b) => b.awardedAt.getTime() - a.awardedAt.getTime()
  );

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const history = sorted.slice(start, start + pageSize);

  return { history, total };
}

// ─── 9. Reset Weekly/Monthly Points ───────────────────────────────────────

export async function resetWeeklyPoints(
  tenantId: string,
  companyId: string
): Promise<number> {
  const result = await StudentGamificationModel.updateMany(
    { tenantId, companyId: toObjectId(companyId) },
    { weeklyPoints: 0, weekResetAt: new Date() }
  );
  return result.modifiedCount;
}

export async function resetMonthlyPoints(
  tenantId: string,
  companyId: string
): Promise<number> {
  const result = await StudentGamificationModel.updateMany(
    { tenantId, companyId: toObjectId(companyId) },
    { monthlyPoints: 0, monthResetAt: new Date() }
  );
  return result.modifiedCount;
}

// ─── 10. Check Broken Streaks ──────────────────────────────────────────────

export async function checkBrokenStreaks(
  tenantId: string,
  companyId: string,
  gracePeriodHours: number = 48
): Promise<number> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - gracePeriodHours);

  const result = await StudentGamificationModel.updateMany(
    {
      tenantId,
      companyId: toObjectId(companyId),
      currentStreak: { $gt: 0 },
      lastActivityDate: { $lt: cutoff },
    },
    { currentStreak: 0 }
  );

  // Sync broken streaks to student model
  if (result.modifiedCount > 0) {
    const broken = await StudentGamificationModel.find({
      tenantId,
      companyId: toObjectId(companyId),
      currentStreak: 0,
      lastActivityDate: { $lt: cutoff },
    }).select("studentUserId");

    for (const profile of broken) {
      await StudentModel.findOneAndUpdate(
        { userId: profile.studentUserId },
        { "stats.currentStreak": 0 }
      );
    }
  }

  return result.modifiedCount;
}

// ─── 11. Manual Award Points (Admin) ──────────────────────────────────────

export async function manualAwardPoints(
  tenantId: string,
  companyId: string,
  studentUserId: string,
  points: number,
  description: string
): Promise<AwardPointsResult> {
  const profile = await getOrCreateProfile(tenantId, companyId, studentUserId);
  const config = await configService.getOrCreateConfig(tenantId, companyId);

  const oldLevel = profile.level;

  profile.totalPoints += points;
  profile.weeklyPoints += points;
  profile.monthlyPoints += points;

  profile.pointHistory.push({
    source: "manual_award",
    points,
    description,
    referenceType: "manual",
    referenceId: "",
    awardedAt: new Date(),
  });

  const levelInfo = configService.getLevelForPoints(config, profile.totalPoints);
  profile.level = levelInfo.level;
  profile.levelName = levelInfo.name;
  profile.pointsToNextLevel = levelInfo.pointsToNextLevel;

  const levelUp = profile.level > oldLevel;

  await profile.save();

  if (levelUp) {
    emitToUser(studentUserId, "gamification:level-up", {
      level: profile.level,
      levelName: profile.levelName,
    });
  }

  return {
    pointsAwarded: points,
    totalPoints: profile.totalPoints,
    levelUp,
    newLevel: profile.level,
    newLevelName: profile.levelName,
    badgesEarned: [],
  };
}
