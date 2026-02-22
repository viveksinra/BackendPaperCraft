import { Types } from "mongoose";
import {
  StudentAnalyticsSnapshotModel,
  StudentAnalyticsSnapshotDocument,
} from "../models/studentAnalyticsSnapshot";
import { TestAttemptModel } from "../models/testAttempt";
import { computeStudentAnalytics } from "./analyticsComputationService";
import { logger } from "../shared/logger";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── getStudentAnalytics ────────────────────────────────────────────────────

export async function getStudentAnalytics(
  companyId: string,
  studentUserId: string,
  options?: { period?: string; forceRefresh?: boolean }
): Promise<StudentAnalyticsSnapshotDocument> {
  const period = options?.period || "all_time";

  const snapshot = await StudentAnalyticsSnapshotModel.findOne({
    companyId: toObjectId(companyId),
    studentUserId: toObjectId(studentUserId),
    period,
  });

  const isStale =
    !snapshot ||
    Date.now() - new Date(snapshot.computedAt).getTime() > STALE_THRESHOLD_MS;

  if (options?.forceRefresh || isStale) {
    logger.info({
      msg: "Recomputing student analytics",
      studentUserId,
      reason: options?.forceRefresh ? "forceRefresh" : "stale",
    });
    return computeStudentAnalytics(companyId, studentUserId, period);
  }

  return snapshot;
}

// ─── getStudentScoreTrend ───────────────────────────────────────────────────

export async function getStudentScoreTrend(
  companyId: string,
  studentUserId: string,
  limit = 20
): Promise<
  Array<{
    date: string;
    testTitle: string;
    percentage: number;
    classAverage: number;
  }>
> {
  const snapshot = await getStudentAnalytics(companyId, studentUserId);
  const tests = (snapshot.testPerformance || [])
    .slice(-limit)
    .map((t) => ({
      date: new Date(t.completedAt).toISOString().substring(0, 10),
      testTitle: t.testTitle,
      percentage: t.percentage,
      classAverage: snapshot.overallStats?.classAverageComparison
        ? t.percentage - snapshot.overallStats.classAverageComparison
        : 0,
    }));

  return tests;
}

// ─── getStudentSubjectRadar ─────────────────────────────────────────────────

export async function getStudentSubjectRadar(
  companyId: string,
  studentUserId: string
): Promise<Array<{ subject: string; studentAvg: number; classAvg: number }>> {
  const snapshot = await getStudentAnalytics(companyId, studentUserId);

  // Get class average per subject
  const classes = await getStudentClassIds(companyId, studentUserId);
  let classSubjectAvgs = new Map<string, number>();

  if (classes.length > 0) {
    const classSnapshots = await StudentAnalyticsSnapshotModel.find({
      companyId: toObjectId(companyId),
      period: "all_time",
    })
      .select("subjectBreakdown")
      .lean();

    const subjectTotals = new Map<string, { sum: number; count: number }>();
    for (const cs of classSnapshots) {
      for (const sb of cs.subjectBreakdown || []) {
        const existing = subjectTotals.get(sb.subjectName) || {
          sum: 0,
          count: 0,
        };
        existing.sum += sb.averagePercentage;
        existing.count += 1;
        subjectTotals.set(sb.subjectName, existing);
      }
    }
    classSubjectAvgs = new Map(
      [...subjectTotals.entries()].map(([name, data]) => [
        name,
        Math.round((data.sum / data.count) * 10) / 10,
      ])
    );
  }

  return (snapshot.subjectBreakdown || []).map((sb) => ({
    subject: sb.subjectName,
    studentAvg: sb.averagePercentage,
    classAvg: classSubjectAvgs.get(sb.subjectName) || 0,
  }));
}

// ─── getStudentTopicDrilldown ───────────────────────────────────────────────

export async function getStudentTopicDrilldown(
  companyId: string,
  studentUserId: string,
  subjectId: string
): Promise<
  Array<{
    topic: string;
    accuracy: number;
    totalQuestions: number;
    trend: number;
  }>
> {
  const snapshot = await getStudentAnalytics(companyId, studentUserId);
  const subjectOid = toObjectId(subjectId);

  return (snapshot.topicPerformance || [])
    .filter((tp) => tp.subjectId.toString() === subjectOid.toString())
    .map((tp) => ({
      topic: tp.topicName || tp.chapterName || "General",
      accuracy: tp.accuracy,
      totalQuestions: tp.totalQuestions,
      trend: 0, // Could be computed from historical snapshots
    }));
}

// ─── getStudentTestComparison ───────────────────────────────────────────────

export async function getStudentTestComparison(
  companyId: string,
  studentUserId: string,
  testId: string
): Promise<{
  studentScore: number;
  studentPercentage: number;
  classAvg: number;
  rank: number | null;
  percentile: number | null;
  totalStudents: number;
}> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);
  const studentOid = toObjectId(studentUserId);

  // Get student's attempt
  const studentAttempt = await TestAttemptModel.findOne({
    companyId: companyOid,
    testId: testOid,
    studentId: studentOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .sort({ submittedAt: -1 })
    .lean();

  // Get all attempts for this test
  const allAttempts = await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .select("result.percentage result.marksObtained")
    .lean();

  const allPercentages = allAttempts.map(
    (a) => (a.result as Record<string, unknown>)?.percentage as number || 0
  );
  const classAvg =
    allPercentages.length > 0
      ? Math.round(
          (allPercentages.reduce((a, b) => a + b, 0) /
            allPercentages.length) *
            10
        ) / 10
      : 0;

  if (!studentAttempt || !studentAttempt.result) {
    return {
      studentScore: 0,
      studentPercentage: 0,
      classAvg,
      rank: null,
      percentile: null,
      totalStudents: allAttempts.length,
    };
  }

  const result = studentAttempt.result as Record<string, unknown>;
  const studentPct = (result.percentage as number) || 0;
  const sorted = [...allPercentages].sort((a, b) => b - a);
  const rank = sorted.indexOf(studentPct) + 1;
  const below = allPercentages.filter((p) => p < studentPct).length;
  const percentile = Math.round((below / allPercentages.length) * 100);

  return {
    studentScore: (result.marksObtained as number) || 0,
    studentPercentage: studentPct,
    classAvg,
    rank,
    percentile,
    totalStudents: allAttempts.length,
  };
}

// ─── getStudentTimeTrend ────────────────────────────────────────────────────

export async function getStudentTimeTrend(
  companyId: string,
  studentUserId: string,
  limit = 20
): Promise<
  Array<{
    date: string;
    testTitle: string;
    avgTime: number;
    classAvgTime: number;
  }>
> {
  const snapshot = await getStudentAnalytics(companyId, studentUserId);
  const classAvgTime =
    snapshot.timeAnalysis?.classAverageTimePerQuestion || 0;

  return (snapshot.testPerformance || []).slice(-limit).map((t) => ({
    date: new Date(t.completedAt).toISOString().substring(0, 10),
    testTitle: t.testTitle,
    avgTime:
      t.timeTakenSeconds > 0
        ? Math.round(t.timeTakenSeconds / Math.max(1, t.sectionScores.length))
        : 0,
    classAvgTime,
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getStudentClassIds(
  companyId: string,
  studentUserId: string
): Promise<string[]> {
  const mongoose = await import("mongoose");
  const Class =
    mongoose.default.models.Class ||
    mongoose.default.model("Class", new mongoose.default.Schema({}, { strict: false }));

  const classes = await Class.find({
    companyId: toObjectId(companyId),
    students: toObjectId(studentUserId),
    status: "active",
  })
    .select("_id")
    .lean();

  return (classes as Array<Record<string, unknown>>).map((c) =>
    (c._id as Types.ObjectId).toString()
  );
}
