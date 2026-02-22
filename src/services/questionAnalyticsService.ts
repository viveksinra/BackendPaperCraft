import { Types } from "mongoose";
import {
  QuestionAnalyticsModel,
  QuestionAnalyticsDocument,
} from "../models/questionAnalytics";
import { computeQuestionAnalytics } from "./analyticsComputationService";
import { logger } from "../shared/logger";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── getQuestionAnalytics ───────────────────────────────────────────────────

export async function getQuestionAnalytics(
  companyId: string,
  questionId: string
): Promise<QuestionAnalyticsDocument> {
  const existing = await QuestionAnalyticsModel.findOne({
    companyId: toObjectId(companyId),
    questionId: toObjectId(questionId),
  });

  const isStale =
    !existing ||
    Date.now() - new Date(existing.computedAt).getTime() > STALE_THRESHOLD_MS;

  if (isStale) {
    logger.info({
      msg: "Recomputing question analytics",
      questionId,
      reason: !existing ? "missing" : "stale",
    });
    return (await computeQuestionAnalytics(
      companyId,
      questionId
    )) as QuestionAnalyticsDocument;
  }

  return existing;
}

// ─── listQuestionAnalytics ──────────────────────────────────────────────────

export async function listQuestionAnalytics(
  companyId: string,
  filters: {
    difficulty?: string;
    actualDifficulty?: string;
    discriminationMin?: number;
    discriminationMax?: number;
    accuracyMin?: number;
    accuracyMax?: number;
    subjectId?: string;
    sortBy?: string;
    sortOrder?: string;
  },
  pagination: { page: number; pageSize: number }
): Promise<{
  questions: QuestionAnalyticsDocument[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  if (filters.difficulty) query.taggedDifficulty = filters.difficulty;
  if (filters.actualDifficulty) query.actualDifficulty = filters.actualDifficulty;

  if (
    filters.discriminationMin !== undefined ||
    filters.discriminationMax !== undefined
  ) {
    const discRange: Record<string, number> = {};
    if (filters.discriminationMin !== undefined)
      discRange.$gte = filters.discriminationMin;
    if (filters.discriminationMax !== undefined)
      discRange.$lte = filters.discriminationMax;
    query.discriminationIndex = discRange;
  }

  if (
    filters.accuracyMin !== undefined ||
    filters.accuracyMax !== undefined
  ) {
    const accRange: Record<string, number> = {};
    if (filters.accuracyMin !== undefined)
      accRange.$gte = filters.accuracyMin;
    if (filters.accuracyMax !== undefined)
      accRange.$lte = filters.accuracyMax;
    query.accuracy = accRange;
  }

  // Sort
  const sortMap: Record<string, string> = {
    accuracy: "accuracy",
    discrimination: "discriminationIndex",
    usage: "usageCount",
    time: "averageTimeSeconds",
  };
  const sortField = sortMap[filters.sortBy || "accuracy"] || "accuracy";
  const sortDir = filters.sortOrder === "asc" ? 1 : -1;

  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const [questions, total] = await Promise.all([
    QuestionAnalyticsModel.find(query)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    QuestionAnalyticsModel.countDocuments(query),
  ]);

  return {
    questions: questions as unknown as QuestionAnalyticsDocument[],
    total,
    page,
    pageSize,
  };
}

// ─── getProblematicQuestions ─────────────────────────────────────────────────

export async function getProblematicQuestions(
  companyId: string,
  limit = 20
): Promise<
  Array<{
    analytics: QuestionAnalyticsDocument;
    issues: string[];
  }>
> {
  const allAnalytics = await QuestionAnalyticsModel.find({
    companyId: toObjectId(companyId),
    totalAttempts: { $gte: 5 }, // minimum attempts for reliable data
  }).lean();

  const problematic: Array<{
    analytics: QuestionAnalyticsDocument;
    issues: string[];
  }> = [];

  for (const qa of allAnalytics as unknown as QuestionAnalyticsDocument[]) {
    const issues: string[] = [];

    // Low discrimination
    if (qa.discriminationIndex < 0.2) {
      issues.push(
        `Low discrimination index (${qa.discriminationIndex}) - question doesn't differentiate well`
      );
    }

    // Difficulty mismatch
    if (
      qa.taggedDifficulty &&
      qa.actualDifficulty &&
      qa.taggedDifficulty !== qa.actualDifficulty
    ) {
      issues.push(
        `Difficulty mismatch: tagged as "${qa.taggedDifficulty}" but actual is "${qa.actualDifficulty}"`
      );
    }

    // Extreme accuracy
    if (qa.accuracy < 20) {
      issues.push(
        `Very low accuracy (${qa.accuracy}%) - question may be too difficult or ambiguous`
      );
    }
    if (qa.accuracy > 95) {
      issues.push(
        `Very high accuracy (${qa.accuracy}%) - question may be too easy`
      );
    }

    if (issues.length > 0) {
      problematic.push({ analytics: qa, issues });
    }
  }

  // Sort by number of issues (most problematic first)
  problematic.sort((a, b) => b.issues.length - a.issues.length);

  return problematic.slice(0, limit);
}

// ─── getDifficultyCalibrationReport ─────────────────────────────────────────

export async function getDifficultyCalibrationReport(
  companyId: string
): Promise<{
  calibration: Array<{
    taggedDifficulty: string;
    expectedRange: { min: number; max: number };
    actualAvgAccuracy: number;
    questionCount: number;
    needsRetagging: number;
  }>;
}> {
  const expectedRanges: Record<string, { min: number; max: number }> = {
    easy: { min: 70, max: 100 },
    medium: { min: 50, max: 70 },
    hard: { min: 30, max: 50 },
    expert: { min: 0, max: 30 },
  };

  const analytics = await QuestionAnalyticsModel.find({
    companyId: toObjectId(companyId),
    totalAttempts: { $gte: 5 },
    taggedDifficulty: { $in: ["easy", "medium", "hard", "expert"] },
  }).lean();

  const grouped = new Map<
    string,
    { accuracies: number[]; needsRetagging: number }
  >();

  for (const qa of analytics) {
    const diff = qa.taggedDifficulty;
    const existing = grouped.get(diff) || {
      accuracies: [],
      needsRetagging: 0,
    };
    existing.accuracies.push(qa.accuracy);
    if (qa.taggedDifficulty !== qa.actualDifficulty) {
      existing.needsRetagging += 1;
    }
    grouped.set(diff, existing);
  }

  const calibration = ["easy", "medium", "hard", "expert"].map((diff) => {
    const data = grouped.get(diff);
    const accs = data?.accuracies || [];
    const avgAccuracy =
      accs.length > 0
        ? Math.round((accs.reduce((a, b) => a + b, 0) / accs.length) * 10) /
          10
        : 0;

    return {
      taggedDifficulty: diff,
      expectedRange: expectedRanges[diff],
      actualAvgAccuracy: avgAccuracy,
      questionCount: accs.length,
      needsRetagging: data?.needsRetagging || 0,
    };
  });

  return { calibration };
}
