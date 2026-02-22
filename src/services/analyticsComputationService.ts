import mongoose, { Types } from "mongoose";
import { TestAttemptModel, TestAttemptDocument } from "../models/testAttempt";
import { OnlineTestDocument } from "../models/onlineTest";
import {
  StudentAnalyticsSnapshotModel,
  StudentAnalyticsSnapshotDocument,
  TopicPerformance,
  TestPerformanceEntry,
  SubjectBreakdown,
  DifficultyAnalysis,
  TimeAnalysis,
} from "../models/studentAnalyticsSnapshot";
import {
  QuestionAnalyticsModel,
  DistractorStats,
} from "../models/questionAnalytics";
import { QuestionModel } from "../models/question";
import { PurchaseModel } from "../models/purchase";
import { logger } from "../shared/logger";

const OnlineTest =
  mongoose.models.OnlineTest ||
  mongoose.model("OnlineTest", new mongoose.Schema({}, { strict: false }));
const Class =
  mongoose.models.Class ||
  mongoose.model("Class", new mongoose.Schema({}, { strict: false }));
const User =
  mongoose.models.User ||
  mongoose.model("User", new mongoose.Schema({}, { strict: false }));
const Student =
  mongoose.models.Student ||
  mongoose.model("Student", new mongoose.Schema({}, { strict: false }));
const Membership =
  mongoose.models.Membership ||
  mongoose.model("Membership", new mongoose.Schema({}, { strict: false }));

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

function computePercentile(
  studentScore: number,
  allScores: number[]
): number {
  if (allScores.length === 0) return 0;
  const below = allScores.filter((s) => s < studentScore).length;
  return Math.round((below / allScores.length) * 100);
}

function computeImprovementRate(percentages: number[]): number {
  if (percentages.length < 2) return 0;
  const firstN = percentages.slice(0, Math.min(5, percentages.length));
  const lastN = percentages.slice(-Math.min(5, percentages.length));
  const avgFirst =
    firstN.reduce((a, b) => a + b, 0) / firstN.length;
  const avgLast =
    lastN.reduce((a, b) => a + b, 0) / lastN.length;
  if (avgFirst === 0) return 0;
  return Math.round(((avgLast - avgFirst) / avgFirst) * 100);
}

function deriveActualDifficulty(accuracy: number): string {
  if (accuracy >= 70) return "easy";
  if (accuracy >= 50) return "medium";
  if (accuracy >= 30) return "hard";
  return "expert";
}

function computeDiscriminationIndex(
  questionId: string,
  attempts: Array<{
    totalScore: number;
    answers: Array<{
      questionId: string;
      isCorrect: boolean | null;
    }>;
  }>
): number {
  if (attempts.length < 4) return 0;

  const sorted = [...attempts].sort((a, b) => b.totalScore - a.totalScore);
  const n27 = Math.max(1, Math.floor(sorted.length * 0.27));
  const topGroup = sorted.slice(0, n27);
  const bottomGroup = sorted.slice(-n27);

  const correctInTop = topGroup.filter((a) =>
    a.answers.some(
      (ans) =>
        ans.questionId === questionId && ans.isCorrect === true
    )
  ).length;

  const correctInBottom = bottomGroup.filter((a) =>
    a.answers.some(
      (ans) =>
        ans.questionId === questionId && ans.isCorrect === true
    )
  ).length;

  const index = (correctInTop / n27) - (correctInBottom / n27);
  return Math.round(index * 100) / 100;
}

function getTimeBucket(seconds: number): string {
  if (seconds <= 10) return "0-10s";
  if (seconds <= 30) return "10-30s";
  if (seconds <= 60) return "30-60s";
  if (seconds <= 120) return "60-120s";
  return "120s+";
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── computeStudentAnalytics ────────────────────────────────────────────────

export async function computeStudentAnalytics(
  companyId: string,
  studentUserId: string,
  period?: string
): Promise<StudentAnalyticsSnapshotDocument> {
  const companyOid = toObjectId(companyId);
  const studentOid = toObjectId(studentUserId);
  const periodKey = period || "all_time";

  // Fetch completed attempts
  const query: Record<string, unknown> = {
    companyId: companyOid,
    studentId: studentOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  };

  // Date filtering for period
  if (period && period !== "all_time") {
    const dateFilter = parsePeriod(period);
    if (dateFilter) {
      query.submittedAt = dateFilter;
    }
  }

  const attempts = (await TestAttemptModel.find(query)
    .sort({ submittedAt: 1 })
    .lean()) as unknown as TestAttemptDocument[];

  // Fetch associated test info
  const testIds = [...new Set(attempts.map((a) => a.testId.toString()))];
  const tests = await OnlineTest.find({
    _id: { $in: testIds.map(toObjectId) },
  }).lean();
  const testMap = new Map(
    (tests as Array<Record<string, unknown>>).map((t: Record<string, unknown>) => [
      (t._id as Types.ObjectId).toString(),
      t,
    ])
  );

  // Fetch question data for topic/subject mapping
  const allQuestionIds = new Set<string>();
  for (const attempt of attempts) {
    for (const ans of attempt.answers || []) {
      allQuestionIds.add(ans.questionId.toString());
    }
  }
  const questions = await QuestionModel.find({
    _id: { $in: [...allQuestionIds].map(toObjectId) },
  }).lean();
  const questionMap = new Map(
    questions.map((q) => [q._id.toString(), q])
  );

  // ─ Test Performance ─
  const testPerformance: TestPerformanceEntry[] = attempts.map((a) => {
    const test = testMap.get(a.testId.toString()) as Record<string, unknown> | undefined;
    const result = a.result!;
    return {
      testId: a.testId,
      testTitle: (test?.title as string) || "Unknown Test",
      testMode: (test?.mode as string) || "unknown",
      completedAt: a.submittedAt || a.createdAt,
      score: result.marksObtained,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      rank: result.rank,
      percentile: result.percentile,
      totalStudents: null,
      timeTakenSeconds: computeAttemptTime(a),
      sectionScores: (result.sectionScores || []).map((s) => ({
        sectionName: s.sectionName,
        score: s.marksObtained,
        totalMarks: s.totalMarks,
        percentage: s.percentage,
      })),
    };
  });

  // ─ Topic Performance ─
  const topicAcc = new Map<
    string,
    {
      subjectId: string;
      subjectName: string;
      chapterId: string | null;
      chapterName: string;
      topicId: string | null;
      topicName: string;
      total: number;
      correct: number;
      totalTime: number;
    }
  >();

  for (const attempt of attempts) {
    for (const ans of attempt.answers || []) {
      const q = questionMap.get(ans.questionId.toString());
      if (!q) continue;
      const meta = q.metadata as Record<string, unknown>;
      const subjectId = (meta?.subjectId || "").toString();
      const subjectName = (meta?.subjectName as string) || "Unknown";
      const topicId = (meta?.topicId || "").toString() || null;
      const topicName = (meta?.topicName as string) || "General";
      const chapterId = (meta?.chapterId || "").toString() || null;
      const chapterName = (meta?.chapterName as string) || "";
      const key = `${subjectId}:${chapterId || ""}:${topicId || ""}`;

      const existing = topicAcc.get(key) || {
        subjectId,
        subjectName,
        chapterId,
        chapterName,
        topicId,
        topicName,
        total: 0,
        correct: 0,
        totalTime: 0,
      };
      existing.total += 1;
      if (ans.isCorrect) existing.correct += 1;
      existing.totalTime += ans.timeSpent || 0;
      topicAcc.set(key, existing);
    }
  }

  const topicPerformance: TopicPerformance[] = [...topicAcc.values()].map(
    (t) => ({
      subjectId: t.subjectId
        ? toObjectId(t.subjectId)
        : new Types.ObjectId(),
      subjectName: t.subjectName,
      chapterId: t.chapterId ? toObjectId(t.chapterId) : null,
      chapterName: t.chapterName,
      topicId: t.topicId ? toObjectId(t.topicId) : null,
      topicName: t.topicName,
      totalQuestions: t.total,
      correctCount: t.correct,
      accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
      averageTimeSeconds:
        t.total > 0 ? Math.round(t.totalTime / t.total) : 0,
    })
  );

  // ─ Subject Breakdown ─
  const subjectAcc = new Map<
    string,
    { subjectName: string; percentages: number[] }
  >();
  for (const attempt of attempts) {
    const result = attempt.result;
    if (!result?.subjectScores) continue;
    for (const ss of result.subjectScores) {
      const existing = subjectAcc.get(ss.subjectId) || {
        subjectName: ss.subjectName,
        percentages: [],
      };
      existing.percentages.push(ss.percentage);
      subjectAcc.set(ss.subjectId, existing);
    }
  }

  const subjectBreakdown: SubjectBreakdown[] = [...subjectAcc.entries()].map(
    ([sid, data]) => {
      const avg =
        data.percentages.length > 0
          ? data.percentages.reduce((a, b) => a + b, 0) /
            data.percentages.length
          : 0;
      const firstHalf = data.percentages.slice(
        0,
        Math.ceil(data.percentages.length / 2)
      );
      const secondHalf = data.percentages.slice(
        Math.ceil(data.percentages.length / 2)
      );
      const avgFirst =
        firstHalf.length > 0
          ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
          : 0;
      const avgSecond =
        secondHalf.length > 0
          ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
          : 0;
      return {
        subjectId: toObjectId(sid),
        subjectName: data.subjectName,
        testCount: data.percentages.length,
        averagePercentage: Math.round(avg * 10) / 10,
        trend: Math.round((avgSecond - avgFirst) * 10) / 10,
      };
    }
  );

  // ─ Overall Stats ─
  const percentages = attempts.map((a) => a.result!.percentage);
  const avgPercentage =
    percentages.length > 0
      ? percentages.reduce((a, b) => a + b, 0) / percentages.length
      : 0;
  const bestPercentage =
    percentages.length > 0 ? Math.max(...percentages) : 0;
  const worstPercentage =
    percentages.length > 0 ? Math.min(...percentages) : 0;

  // Average time per question
  let totalQuestionTime = 0;
  let totalQuestionCount = 0;
  for (const a of attempts) {
    for (const ans of a.answers || []) {
      if (ans.timeSpent > 0) {
        totalQuestionTime += ans.timeSpent;
        totalQuestionCount += 1;
      }
    }
  }
  const avgTimePerQuestion =
    totalQuestionCount > 0
      ? Math.round(totalQuestionTime / totalQuestionCount)
      : 0;

  const improvementRate = computeImprovementRate(percentages);

  // Class & org percentiles
  const { percentileInClass, classAvg } = await computeClassPercentile(
    companyOid,
    studentOid,
    avgPercentage
  );
  const percentileInOrg = await computeOrgPercentile(
    companyOid,
    studentOid,
    avgPercentage
  );

  const overallStats = {
    totalTestsTaken: attempts.length,
    averagePercentage: Math.round(avgPercentage * 10) / 10,
    bestPercentage: Math.round(bestPercentage * 10) / 10,
    worstPercentage: Math.round(worstPercentage * 10) / 10,
    averageTimePerQuestion: avgTimePerQuestion,
    improvementRate,
    classAverageComparison: Math.round((avgPercentage - classAvg) * 10) / 10,
    percentileInClass,
    percentileInOrg,
  };

  // ─ Difficulty Analysis ─
  const diffBuckets = {
    easy: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    hard: { total: 0, correct: 0 },
    expert: { total: 0, correct: 0 },
  };
  for (const attempt of attempts) {
    for (const ans of attempt.answers || []) {
      const q = questionMap.get(ans.questionId.toString());
      if (!q) continue;
      const meta = q.metadata as Record<string, unknown>;
      const diff = ((meta?.difficulty as string) || "medium").toLowerCase();
      const bucket =
        diff in diffBuckets
          ? (diff as keyof typeof diffBuckets)
          : "medium";
      diffBuckets[bucket].total += 1;
      if (ans.isCorrect) diffBuckets[bucket].correct += 1;
    }
  }
  const difficultyAnalysis: DifficultyAnalysis = {
    easy: {
      ...diffBuckets.easy,
      accuracy:
        diffBuckets.easy.total > 0
          ? Math.round(
              (diffBuckets.easy.correct / diffBuckets.easy.total) * 100
            )
          : 0,
    },
    medium: {
      ...diffBuckets.medium,
      accuracy:
        diffBuckets.medium.total > 0
          ? Math.round(
              (diffBuckets.medium.correct / diffBuckets.medium.total) * 100
            )
          : 0,
    },
    hard: {
      ...diffBuckets.hard,
      accuracy:
        diffBuckets.hard.total > 0
          ? Math.round(
              (diffBuckets.hard.correct / diffBuckets.hard.total) * 100
            )
          : 0,
    },
    expert: {
      ...diffBuckets.expert,
      accuracy:
        diffBuckets.expert.total > 0
          ? Math.round(
              (diffBuckets.expert.correct / diffBuckets.expert.total) * 100
            )
          : 0,
    },
  };

  // ─ Time Analysis ─
  const questionTimes: number[] = [];
  for (const a of attempts) {
    for (const ans of a.answers || []) {
      if (ans.timeSpent > 0) questionTimes.push(ans.timeSpent);
    }
  }
  const timeBucketMap = new Map<string, number>();
  for (const t of questionTimes) {
    const bucket = getTimeBucket(t);
    timeBucketMap.set(bucket, (timeBucketMap.get(bucket) || 0) + 1);
  }

  const classAvgTime = await computeClassAvgTimePerQuestion(
    companyOid,
    studentOid
  );

  const timeAnalysis: TimeAnalysis = {
    averageTimePerQuestion: avgTimePerQuestion,
    classAverageTimePerQuestion: classAvgTime,
    fastestQuestionTime:
      questionTimes.length > 0 ? Math.min(...questionTimes) : 0,
    slowestQuestionTime:
      questionTimes.length > 0 ? Math.max(...questionTimes) : 0,
    timeDistribution: [
      "0-10s",
      "10-30s",
      "30-60s",
      "60-120s",
      "120s+",
    ].map((label) => ({
      label,
      count: timeBucketMap.get(label) || 0,
    })),
  };

  // ─ Upsert ─
  const snapshot = await StudentAnalyticsSnapshotModel.findOneAndUpdate(
    {
      studentUserId: studentOid,
      companyId: companyOid,
      period: periodKey,
    },
    {
      tenantId: attempts[0]?.tenantId || "",
      testPerformance,
      topicPerformance,
      subjectBreakdown,
      overallStats,
      difficultyAnalysis,
      timeAnalysis,
      computedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return snapshot;
}

// ─── computeClassAnalytics ──────────────────────────────────────────────────

export async function computeClassAnalytics(
  companyId: string,
  classId: string,
  testId: string
): Promise<{
  scoreStats: {
    avg: number;
    median: number;
    highest: number;
    lowest: number;
    stdDev: number;
  };
  scoreDistribution: Array<{ bucket: string; count: number }>;
  topPerformers: Array<{
    studentId: string;
    name: string;
    score: number;
    percentage: number;
  }>;
  bottomPerformers: Array<{
    studentId: string;
    name: string;
    score: number;
    percentage: number;
  }>;
  mostMissedQuestions: Array<{
    questionId: string;
    accuracy: number;
    totalAttempts: number;
  }>;
  completionRate: number;
  topicHeatmap: {
    students: Array<{
      name: string;
      topicAccuracies: Record<string, number>;
    }>;
    topics: Array<{ id: string; name: string }>;
  };
}> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);
  const testOid = toObjectId(testId);

  // Get class students
  const cls = (await Class.findById(classOid).lean()) as Record<
    string,
    unknown
  > | null;
  const studentIds: string[] = (
    (cls?.students as Types.ObjectId[]) || []
  ).map((s) => s.toString());

  // Get attempts for this test by class students
  const attempts = (await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    studentId: { $in: studentIds.map(toObjectId) },
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .lean()) as unknown as TestAttemptDocument[];

  // Student name map
  const userIds = [...new Set(attempts.map((a) => a.studentId.toString()))];
  const users = await User.find({
    _id: { $in: userIds.map(toObjectId) },
  }).lean();
  const nameMap = new Map(
    (users as Array<Record<string, unknown>>).map((u) => [
      (u._id as Types.ObjectId).toString(),
      (u.name as string) || (u.email as string) || "Unknown",
    ])
  );

  // Score stats
  const percentages = attempts.map((a) => a.result!.percentage);
  const avg =
    percentages.length > 0
      ? percentages.reduce((a, b) => a + b, 0) / percentages.length
      : 0;
  const med = median(percentages);
  const highest = percentages.length > 0 ? Math.max(...percentages) : 0;
  const lowest = percentages.length > 0 ? Math.min(...percentages) : 0;
  const variance =
    percentages.length > 0
      ? percentages.reduce((sum, p) => sum + (p - avg) ** 2, 0) /
        percentages.length
      : 0;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  // Score distribution (10 buckets)
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    bucket: `${i * 10}-${(i + 1) * 10}%`,
    count: 0,
  }));
  for (const p of percentages) {
    const idx = Math.min(Math.floor(p / 10), 9);
    buckets[idx].count += 1;
  }

  // Top/bottom performers
  const sorted = [...attempts].sort(
    (a, b) => b.result!.percentage - a.result!.percentage
  );
  const topPerformers = sorted.slice(0, 5).map((a) => ({
    studentId: a.studentId.toString(),
    name: nameMap.get(a.studentId.toString()) || "Unknown",
    score: a.result!.marksObtained,
    percentage: a.result!.percentage,
  }));
  const bottomPerformers = sorted
    .slice(-5)
    .reverse()
    .map((a) => ({
      studentId: a.studentId.toString(),
      name: nameMap.get(a.studentId.toString()) || "Unknown",
      score: a.result!.marksObtained,
      percentage: a.result!.percentage,
    }));

  // Most missed questions
  const questionAcc = new Map<
    string,
    { total: number; correct: number }
  >();
  for (const a of attempts) {
    for (const ans of a.answers || []) {
      const qid = ans.questionId.toString();
      const ex = questionAcc.get(qid) || { total: 0, correct: 0 };
      ex.total += 1;
      if (ans.isCorrect) ex.correct += 1;
      questionAcc.set(qid, ex);
    }
  }
  const mostMissedQuestions = [...questionAcc.entries()]
    .map(([qid, data]) => ({
      questionId: qid,
      accuracy:
        data.total > 0
          ? Math.round((data.correct / data.total) * 100)
          : 0,
      totalAttempts: data.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);

  // Completion rate
  const completionRate =
    studentIds.length > 0
      ? Math.round((attempts.length / studentIds.length) * 100)
      : 0;

  // Topic heatmap
  const questionIds = new Set<string>();
  for (const a of attempts) {
    for (const ans of a.answers || []) {
      questionIds.add(ans.questionId.toString());
    }
  }
  const qs = await QuestionModel.find({
    _id: { $in: [...questionIds].map(toObjectId) },
  }).lean();
  const qMap = new Map(qs.map((q) => [q._id.toString(), q]));

  const topicSet = new Map<string, string>();
  for (const q of qs) {
    const meta = q.metadata as Record<string, unknown>;
    const topicId = (meta?.topicId || meta?.subjectId || "").toString();
    const topicName =
      (meta?.topicName as string) ||
      (meta?.subjectName as string) ||
      "General";
    if (topicId) topicSet.set(topicId, topicName);
  }

  const topics = [...topicSet.entries()].map(([id, name]) => ({
    id,
    name,
  }));

  const studentHeatmap = attempts.map((a) => {
    const studentName =
      nameMap.get(a.studentId.toString()) || "Unknown";
    const topicAccuracies: Record<string, number> = {};
    const topicTotals: Record<string, { correct: number; total: number }> =
      {};

    for (const ans of a.answers || []) {
      const q = qMap.get(ans.questionId.toString());
      if (!q) continue;
      const meta = q.metadata as Record<string, unknown>;
      const topicId = (
        meta?.topicId ||
        meta?.subjectId ||
        ""
      ).toString();
      if (!topicId) continue;

      const ex = topicTotals[topicId] || { correct: 0, total: 0 };
      ex.total += 1;
      if (ans.isCorrect) ex.correct += 1;
      topicTotals[topicId] = ex;
    }

    for (const [tid, data] of Object.entries(topicTotals)) {
      topicAccuracies[tid] =
        data.total > 0
          ? Math.round((data.correct / data.total) * 100)
          : 0;
    }

    return { name: studentName, topicAccuracies };
  });

  return {
    scoreStats: {
      avg: Math.round(avg * 10) / 10,
      median: Math.round(med * 10) / 10,
      highest: Math.round(highest * 10) / 10,
      lowest: Math.round(lowest * 10) / 10,
      stdDev,
    },
    scoreDistribution: buckets,
    topPerformers,
    bottomPerformers,
    mostMissedQuestions,
    completionRate,
    topicHeatmap: { students: studentHeatmap, topics },
  };
}

// ─── computeQuestionAnalytics ───────────────────────────────────────────────

export async function computeQuestionAnalytics(
  companyId: string,
  questionId: string
) {
  const companyOid = toObjectId(companyId);
  const questionOid = toObjectId(questionId);

  // Find all attempts containing this question
  const attempts = (await TestAttemptModel.find({
    companyId: companyOid,
    "answers.questionId": questionOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .lean()) as unknown as TestAttemptDocument[];

  let totalAttempts = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  const times: number[] = [];
  const optionCounts = new Map<string, number>();

  // For discrimination index
  const attemptData: Array<{
    totalScore: number;
    answers: Array<{ questionId: string; isCorrect: boolean | null }>;
  }> = [];

  for (const attempt of attempts) {
    const ans = (attempt.answers || []).find(
      (a) => a.questionId.toString() === questionId
    );
    if (!ans) continue;
    totalAttempts += 1;

    if (ans.isCorrect === true) correctCount += 1;
    else if (ans.isCorrect === false) incorrectCount += 1;
    else skippedCount += 1;

    if (ans.timeSpent > 0) times.push(ans.timeSpent);

    // Track option selection for MCQ distractor analysis
    if (ans.answer != null) {
      const selected = String(ans.answer);
      optionCounts.set(selected, (optionCounts.get(selected) || 0) + 1);
    }

    attemptData.push({
      totalScore: attempt.result?.marksObtained || 0,
      answers: (attempt.answers || []).map((a) => ({
        questionId: a.questionId.toString(),
        isCorrect: a.isCorrect,
      })),
    });
  }

  const accuracy =
    totalAttempts > 0
      ? Math.round((correctCount / totalAttempts) * 100)
      : 0;
  const averageTimeSeconds =
    times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;
  const medianTimeSeconds = Math.round(median(times));

  // Get question details for distractor analysis
  const question = await QuestionModel.findById(questionOid).lean();
  const meta = (question?.metadata || {}) as Record<string, unknown>;
  const content = (question?.content || {}) as Record<string, unknown>;
  const taggedDifficulty = (meta?.difficulty as string) || "";
  const actualDifficulty = deriveActualDifficulty(accuracy);
  const discriminationIndex = computeDiscriminationIndex(
    questionId,
    attemptData
  );

  // Distractor analysis (MCQ only)
  let distractorAnalysis: DistractorStats[] = [];
  const options = content?.options as
    | Array<Record<string, unknown>>
    | undefined;
  if (options && Array.isArray(options)) {
    const correctAnswer = content?.correctAnswer;
    distractorAnalysis = options.map((opt, i) => {
      const label = String.fromCharCode(65 + i); // A, B, C, D
      const value =
        typeof opt === "object"
          ? ((opt?.text as string) || (opt?.value as string) || "").substring(
              0,
              50
            )
          : String(opt).substring(0, 50);
      const selectedCount = optionCounts.get(String(i)) || optionCounts.get(label) || 0;
      return {
        label,
        value,
        selectedCount,
        selectedPercentage:
          totalAttempts > 0
            ? Math.round((selectedCount / totalAttempts) * 100)
            : 0,
        isCorrect: String(correctAnswer) === String(i) || String(correctAnswer) === label,
      };
    });
  }

  // Usage count (how many tests include this question)
  const usageCount = await OnlineTest.countDocuments({
    companyId: companyOid,
    "sections.questionIds": questionOid,
  });

  const lastTest = await OnlineTest.findOne({
    companyId: companyOid,
    "sections.questionIds": questionOid,
  })
    .sort({ createdAt: -1 })
    .lean();
  const lastUsedAt = (lastTest as Record<string, unknown>)?.createdAt as Date | null;

  // Upsert
  const analytics = await QuestionAnalyticsModel.findOneAndUpdate(
    { companyId: companyOid, questionId: questionOid },
    {
      tenantId: (question?.tenantId as string) || "",
      totalAttempts,
      correctCount,
      incorrectCount,
      skippedCount,
      accuracy,
      averageTimeSeconds,
      medianTimeSeconds,
      taggedDifficulty,
      actualDifficulty,
      discriminationIndex,
      distractorAnalysis,
      usageCount,
      lastUsedAt,
      computedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return analytics;
}

// ─── computeInstituteAnalytics ──────────────────────────────────────────────

export async function computeInstituteAnalytics(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string }
) {
  const companyOid = toObjectId(companyId);
  const dateFilter: Record<string, unknown> = {};
  if (dateRange?.startDate)
    dateFilter.$gte = new Date(dateRange.startDate);
  if (dateRange?.endDate)
    dateFilter.$lte = new Date(dateRange.endDate);

  const hasDateFilter = Object.keys(dateFilter).length > 0;

  // Enrollment trends
  const membershipQuery: Record<string, unknown> = {
    companyId: companyOid,
    role: "student",
  };
  if (hasDateFilter) membershipQuery.createdAt = dateFilter;

  const enrollmentTrends = await Membership.aggregate([
    { $match: membershipQuery },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$createdAt" },
        },
        newStudents: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  let cumulative = 0;
  const enrollmentData = enrollmentTrends.map(
    (e: Record<string, unknown>) => {
      cumulative += (e.newStudents as number) || 0;
      return {
        date: e._id as string,
        newStudents: (e.newStudents as number) || 0,
        totalStudents: cumulative,
      };
    }
  );

  // Revenue trends (from Purchase collection)
  const purchaseQuery: Record<string, unknown> = {
    companyId: companyOid,
    status: "completed",
  };
  if (hasDateFilter) purchaseQuery.completedAt = dateFilter;

  const revenueTrends = await PurchaseModel.aggregate([
    { $match: purchaseQuery },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$completedAt" },
        },
        revenue: { $sum: "$amount" },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Teacher activity
  const teacherActivity = await getTeacherActivity(
    companyOid,
    hasDateFilter ? dateFilter : undefined
  );

  // Student retention
  const studentRetention = await getStudentRetention(companyOid);

  // Content usage
  const contentUsageQuery: Record<string, unknown> = {
    companyId: companyOid,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
  };
  if (hasDateFilter) contentUsageQuery.createdAt = dateFilter;

  const contentUsage = await TestAttemptModel.aggregate([
    { $match: contentUsageQuery },
    {
      $group: {
        _id: "$testId",
        attemptCount: { $sum: 1 },
        avgScore: { $avg: "$result.percentage" },
        uniqueStudents: { $addToSet: "$studentId" },
      },
    },
    { $sort: { attemptCount: -1 } },
    { $limit: 20 },
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
        title: { $ifNull: ["$test.title", "Unknown"] },
        type: { $ifNull: ["$test.mode", "unknown"] },
        attemptCount: 1,
        avgScore: { $round: ["$avgScore", 1] },
        uniqueStudents: { $size: "$uniqueStudents" },
      },
    },
  ]);

  // Question bank stats
  const questionBankStats = await getQuestionBankStats(companyOid);

  return {
    enrollmentTrends: enrollmentData,
    revenueTrends,
    teacherActivity,
    studentRetention,
    contentUsage,
    questionBankStats,
  };
}

// ─── computeBulkStudentAnalytics ────────────────────────────────────────────

export async function computeBulkStudentAnalytics(
  companyId: string,
  classId: string
): Promise<number> {
  const cls = (await Class.findById(toObjectId(classId)).lean()) as Record<
    string,
    unknown
  > | null;
  const studentIds: string[] = (
    (cls?.students as Types.ObjectId[]) || []
  ).map((s) => s.toString());

  let updated = 0;
  for (const sid of studentIds) {
    try {
      await computeStudentAnalytics(companyId, sid);
      updated += 1;
    } catch (err) {
      logger.warn({
        msg: "Failed to compute analytics for student",
        studentUserId: sid,
        error: (err as Error).message,
      });
    }
  }

  return updated;
}

// ─── recomputeAfterTestCompletion ───────────────────────────────────────────

export async function recomputeAfterTestCompletion(
  companyId: string,
  testId: string,
  studentUserId: string
): Promise<void> {
  // Recompute student analytics
  await computeStudentAnalytics(companyId, studentUserId);

  // Recompute question analytics for all questions in the test
  const test = (await OnlineTest.findById(toObjectId(testId)).lean()) as Record<
    string,
    unknown
  > | null;
  if (!test) return;

  const sections = (test.sections as Array<Record<string, unknown>>) || [];
  const questionIds = new Set<string>();
  for (const section of sections) {
    const qIds = (section.questionIds as Types.ObjectId[]) || [];
    for (const qid of qIds) {
      questionIds.add(qid.toString());
    }
  }

  for (const qid of questionIds) {
    try {
      await computeQuestionAnalytics(companyId, qid);
    } catch (err) {
      logger.warn({
        msg: "Failed to recompute question analytics",
        questionId: qid,
        error: (err as Error).message,
      });
    }
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function parsePeriod(
  period: string
): Record<string, Date> | null {
  // Format: "2026-02" (month), "2026-Q1" (quarter), "all_time"
  if (period === "all_time") return null;

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      $gte: new Date(year, month, 1),
      $lt: new Date(year, month + 1, 1),
    };
  }

  const quarterMatch = period.match(/^(\d{4})-Q(\d)$/);
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1]);
    const q = parseInt(quarterMatch[2]);
    const startMonth = (q - 1) * 3;
    return {
      $gte: new Date(year, startMonth, 1),
      $lt: new Date(year, startMonth + 3, 1),
    };
  }

  return null;
}

function computeAttemptTime(attempt: TestAttemptDocument): number {
  if (attempt.startedAt && attempt.submittedAt) {
    return Math.round(
      (new Date(attempt.submittedAt).getTime() -
        new Date(attempt.startedAt).getTime()) /
        1000
    );
  }
  // Fallback: sum answer times
  return (attempt.answers || []).reduce(
    (sum, a) => sum + (a.timeSpent || 0),
    0
  );
}

async function computeClassPercentile(
  companyOid: Types.ObjectId,
  studentOid: Types.ObjectId,
  studentAvg: number
): Promise<{ percentileInClass: number; classAvg: number }> {
  // Find classes the student belongs to
  const classes = await Class.find({
    companyId: companyOid,
    students: studentOid,
    status: "active",
  }).lean();

  if (!classes || (classes as Array<unknown>).length === 0)
    return { percentileInClass: 0, classAvg: 0 };

  const cls = (classes as Array<Record<string, unknown>>)[0];
  const classStudentIds = (
    (cls.students as Types.ObjectId[]) || []
  ).map((s) => s.toString());

  // Get average percentage for each class student
  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    studentUserId: { $in: classStudentIds.map(toObjectId) },
    period: "all_time",
  }).lean();

  const allAvgs = snapshots.map(
    (s) => s.overallStats?.averagePercentage || 0
  );
  const classAvg =
    allAvgs.length > 0
      ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length
      : 0;
  const percentileInClass = computePercentile(studentAvg, allAvgs);

  return { percentileInClass, classAvg };
}

async function computeOrgPercentile(
  companyOid: Types.ObjectId,
  studentOid: Types.ObjectId,
  studentAvg: number
): Promise<number> {
  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    period: "all_time",
    studentUserId: { $ne: studentOid },
  })
    .select("overallStats.averagePercentage")
    .lean();

  const allAvgs = snapshots.map(
    (s) => s.overallStats?.averagePercentage || 0
  );
  return computePercentile(studentAvg, allAvgs);
}

async function computeClassAvgTimePerQuestion(
  companyOid: Types.ObjectId,
  studentOid: Types.ObjectId
): Promise<number> {
  const classes = await Class.find({
    companyId: companyOid,
    students: studentOid,
    status: "active",
  }).lean();

  if (!classes || (classes as Array<unknown>).length === 0) return 0;

  const cls = (classes as Array<Record<string, unknown>>)[0];
  const classStudentIds = (
    (cls.students as Types.ObjectId[]) || []
  ).map((s) => s.toString());

  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    studentUserId: { $in: classStudentIds.map(toObjectId) },
    period: "all_time",
  })
    .select("timeAnalysis.averageTimePerQuestion")
    .lean();

  const times = snapshots
    .map((s) => s.timeAnalysis?.averageTimePerQuestion || 0)
    .filter((t) => t > 0);

  return times.length > 0
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
}

async function getTeacherActivity(
  companyOid: Types.ObjectId,
  dateFilter?: Record<string, unknown>
) {
  const teacherMembers = await Membership.find({
    companyId: companyOid,
    role: { $in: ["teacher", "senior_teacher", "admin", "owner"] },
  }).lean();

  const teacherEmails = (teacherMembers as Array<Record<string, unknown>>).map(
    (m) => (m.userEmail as string) || ""
  );

  const result: Array<{
    teacher: string;
    questionsCreated: number;
    testsCreated: number;
    classesManaged: number;
    lastActive: Date | null;
  }> = [];

  for (const email of teacherEmails) {
    if (!email) continue;

    const qQuery: Record<string, unknown> = {
      companyId: companyOid,
    };
    if (dateFilter) qQuery.createdAt = dateFilter;

    const questionsCreated = await QuestionModel.countDocuments({
      ...qQuery,
      "metadata.createdBy": email,
    });

    const testsCreated = await OnlineTest.countDocuments({
      ...qQuery,
      createdBy: email,
    });

    const classesManaged = await Class.countDocuments({
      companyId: companyOid,
      teachers: { $elemMatch: { $exists: true } },
    });

    result.push({
      teacher: email,
      questionsCreated,
      testsCreated,
      classesManaged,
      lastActive: null,
    });
  }

  return result;
}

async function getStudentRetention(companyOid: Types.ObjectId) {
  // Cohort-based retention: group students by enrollment month,
  // check if they were active (had a test attempt) in subsequent months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const students = await Membership.find({
    companyId: companyOid,
    role: "student",
    createdAt: { $gte: sixMonthsAgo },
  }).lean();

  const cohortMap = new Map<
    string,
    { emails: string[]; total: number }
  >();
  for (const s of students as Array<Record<string, unknown>>) {
    const month = new Date(s.createdAt as Date)
      .toISOString()
      .substring(0, 7);
    const existing = cohortMap.get(month) || { emails: [], total: 0 };
    existing.emails.push((s.userEmail as string) || "");
    existing.total += 1;
    cohortMap.set(month, existing);
  }

  const cohorts: Array<{
    enrollMonth: string;
    total: number;
    retention: Record<string, number>;
  }> = [];

  for (const [month, data] of cohortMap) {
    const retention: Record<string, number> = {};
    // Check each subsequent month
    const startDate = new Date(month + "-01");
    for (let i = 1; i <= 6; i++) {
      const checkDate = new Date(startDate);
      checkDate.setMonth(checkDate.getMonth() + i);
      const checkMonth = checkDate.toISOString().substring(0, 7);

      const activeCount = await TestAttemptModel.countDocuments({
        companyId: companyOid,
        createdAt: {
          $gte: new Date(checkMonth + "-01"),
          $lt: new Date(
            new Date(checkMonth + "-01").setMonth(
              new Date(checkMonth + "-01").getMonth() + 1
            )
          ),
        },
      });

      retention[`month${i}`] =
        data.total > 0
          ? Math.round((activeCount / data.total) * 100)
          : 0;
    }

    cohorts.push({ enrollMonth: month, total: data.total, retention });
  }

  return { cohorts };
}

async function getQuestionBankStats(companyOid: Types.ObjectId) {
  const byType = await QuestionModel.aggregate([
    { $match: { companyId: companyOid, isArchived: { $ne: true } } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  const byDifficulty = await QuestionModel.aggregate([
    { $match: { companyId: companyOid, isArchived: { $ne: true } } },
    { $group: { _id: "$metadata.difficulty", count: { $sum: 1 } } },
  ]);

  const byStatus = await QuestionModel.aggregate([
    { $match: { companyId: companyOid } },
    { $group: { _id: "$review.status", count: { $sum: 1 } } },
  ]);

  const total = await QuestionModel.countDocuments({
    companyId: companyOid,
    isArchived: { $ne: true },
  });

  return {
    total,
    byType: Object.fromEntries(
      byType.map((b: Record<string, unknown>) => [b._id, b.count])
    ),
    byDifficulty: Object.fromEntries(
      byDifficulty.map((b: Record<string, unknown>) => [
        b._id || "unset",
        b.count,
      ])
    ),
    byStatus: Object.fromEntries(
      byStatus.map((b: Record<string, unknown>) => [
        b._id || "unset",
        b.count,
      ])
    ),
  };
}
