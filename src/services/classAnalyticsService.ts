import mongoose, { Types } from "mongoose";
import { TestAttemptModel } from "../models/testAttempt";
import { StudentAnalyticsSnapshotModel } from "../models/studentAnalyticsSnapshot";
import { computeClassAnalytics } from "./analyticsComputationService";

const OnlineTest =
  mongoose.models.OnlineTest ||
  mongoose.model("OnlineTest", new mongoose.Schema({}, { strict: false }));
const Class =
  mongoose.models.Class ||
  mongoose.model("Class", new mongoose.Schema({}, { strict: false }));
const User =
  mongoose.models.User ||
  mongoose.model("User", new mongoose.Schema({}, { strict: false }));

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── getClassAnalytics ──────────────────────────────────────────────────────

export async function getClassAnalytics(
  companyId: string,
  classId: string
): Promise<{
  studentCount: number;
  testCount: number;
  homeworkCount: number;
  overallAverageScore: number;
  improvementTrend: number;
}> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const cls = (await Class.findById(classOid).lean()) as Record<
    string,
    unknown
  > | null;
  const studentCount = ((cls?.students as unknown[]) || []).length;

  // Count tests assigned to this class
  const testCount = await OnlineTest.countDocuments({
    companyId: companyOid,
    "assignment.classIds": classOid,
  });

  // Homework count
  const Homework =
    mongoose.models.Homework ||
    mongoose.model("Homework", new mongoose.Schema({}, { strict: false }));
  const homeworkCount = await Homework.countDocuments({
    companyId: companyOid,
    classId: classOid,
  });

  // Class average from snapshots
  const studentIds = ((cls?.students as Types.ObjectId[]) || []).map((s) =>
    s.toString()
  );
  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    studentUserId: { $in: studentIds.map(toObjectId) },
    period: "all_time",
  })
    .select("overallStats.averagePercentage overallStats.improvementRate")
    .lean();

  const avgs = snapshots.map(
    (s) => s.overallStats?.averagePercentage || 0
  );
  const overallAverageScore =
    avgs.length > 0
      ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10
      : 0;

  const improvements = snapshots.map(
    (s) => s.overallStats?.improvementRate || 0
  );
  const improvementTrend =
    improvements.length > 0
      ? Math.round(
          (improvements.reduce((a, b) => a + b, 0) / improvements.length) * 10
        ) / 10
      : 0;

  return {
    studentCount,
    testCount,
    homeworkCount,
    overallAverageScore,
    improvementTrend,
  };
}

// ─── getClassTestAnalytics ──────────────────────────────────────────────────

export async function getClassTestAnalytics(
  companyId: string,
  classId: string,
  testId: string
) {
  return computeClassAnalytics(companyId, classId, testId);
}

// ─── getClassTopicHeatmap ───────────────────────────────────────────────────

export async function getClassTopicHeatmap(
  companyId: string,
  classId: string,
  subjectId: string
): Promise<{
  students: Array<{
    name: string;
    topicAccuracies: Record<string, number>;
  }>;
  topics: Array<{ id: string; name: string }>;
}> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);
  const subjectOid = toObjectId(subjectId);

  const cls = (await Class.findById(classOid).lean()) as Record<
    string,
    unknown
  > | null;
  const studentIds = ((cls?.students as Types.ObjectId[]) || []).map((s) =>
    s.toString()
  );

  // Get user names
  const users = await User.find({
    _id: { $in: studentIds.map(toObjectId) },
  }).lean();
  const nameMap = new Map(
    (users as Array<Record<string, unknown>>).map((u) => [
      (u._id as Types.ObjectId).toString(),
      (u.name as string) || (u.email as string) || "Unknown",
    ])
  );

  // Get snapshots for topic performance filtered by subject
  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    studentUserId: { $in: studentIds.map(toObjectId) },
    period: "all_time",
  })
    .select("studentUserId topicPerformance")
    .lean();

  const topicSet = new Map<string, string>();
  const students: Array<{
    name: string;
    topicAccuracies: Record<string, number>;
  }> = [];

  for (const snap of snapshots) {
    const name =
      nameMap.get(snap.studentUserId.toString()) || "Unknown";
    const topicAccuracies: Record<string, number> = {};

    for (const tp of snap.topicPerformance || []) {
      if (tp.subjectId.toString() !== subjectOid.toString()) continue;
      const topicId =
        tp.topicId?.toString() || tp.chapterId?.toString() || "general";
      const topicName = tp.topicName || tp.chapterName || "General";
      topicAccuracies[topicId] = tp.accuracy;
      topicSet.set(topicId, topicName);
    }

    students.push({ name, topicAccuracies });
  }

  const topics = [...topicSet.entries()].map(([id, name]) => ({
    id,
    name,
  }));

  return { students, topics };
}

// ─── getClassComparisonAcrossTests ──────────────────────────────────────────

export async function getClassComparisonAcrossTests(
  companyId: string,
  classId: string
): Promise<
  Array<{
    testId: string;
    testTitle: string;
    date: string;
    classAvg: number;
    testCount: number;
  }>
> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const cls = (await Class.findById(classOid).lean()) as Record<
    string,
    unknown
  > | null;
  const studentIds = ((cls?.students as Types.ObjectId[]) || []).map((s) =>
    toObjectId(s.toString())
  );

  const results = await TestAttemptModel.aggregate([
    {
      $match: {
        companyId: companyOid,
        studentId: { $in: studentIds },
        status: { $in: ["submitted", "auto_submitted", "graded"] },
        result: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$testId",
        classAvg: { $avg: "$result.percentage" },
        testCount: { $sum: 1 },
        latestDate: { $max: "$submittedAt" },
      },
    },
    { $sort: { latestDate: 1 } },
    {
      $lookup: {
        from: "onlinetests",
        localField: "_id",
        foreignField: "_id",
        as: "test",
      },
    },
    { $unwind: { path: "$test", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        testId: "$_id",
        testTitle: { $ifNull: ["$test.title", "Unknown"] },
        date: {
          $dateToString: { format: "%Y-%m-%d", date: "$latestDate" },
        },
        classAvg: { $round: ["$classAvg", 1] },
        testCount: 1,
      },
    },
  ]);

  return results.map((r: Record<string, unknown>) => ({
    testId: (r.testId as Types.ObjectId).toString(),
    testTitle: r.testTitle as string,
    date: r.date as string,
    classAvg: r.classAvg as number,
    testCount: r.testCount as number,
  }));
}

// ─── getClassStudentRankings ────────────────────────────────────────────────

export async function getClassStudentRankings(
  companyId: string,
  classId: string,
  testId: string
): Promise<
  Array<{
    rank: number;
    name: string;
    studentId: string;
    score: number;
    percentage: number;
    timeUsed: number;
    improvementFromLastTest: number;
  }>
> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);
  const testOid = toObjectId(testId);

  const cls = (await Class.findById(classOid).lean()) as Record<
    string,
    unknown
  > | null;
  const studentIds = ((cls?.students as Types.ObjectId[]) || []).map((s) =>
    toObjectId(s.toString())
  );

  const attempts = await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    studentId: { $in: studentIds },
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .sort({ "result.percentage": -1 })
    .lean();

  const users = await User.find({
    _id: { $in: studentIds },
  }).lean();
  const nameMap = new Map(
    (users as Array<Record<string, unknown>>).map((u) => [
      (u._id as Types.ObjectId).toString(),
      (u.name as string) || (u.email as string) || "Unknown",
    ])
  );

  let currentRank = 0;
  let lastPercentage = -1;

  return attempts.map((a, i) => {
    const result = a.result as Record<string, unknown>;
    const pct = (result?.percentage as number) || 0;
    if (pct !== lastPercentage) {
      currentRank = i + 1;
      lastPercentage = pct;
    }

    const timeUsed =
      a.startedAt && a.submittedAt
        ? Math.round(
            (new Date(a.submittedAt).getTime() -
              new Date(a.startedAt).getTime()) /
              1000
          )
        : 0;

    return {
      rank: currentRank,
      name: nameMap.get(a.studentId.toString()) || "Unknown",
      studentId: a.studentId.toString(),
      score: (result?.marksObtained as number) || 0,
      percentage: pct,
      timeUsed,
      improvementFromLastTest: 0,
    };
  });
}
