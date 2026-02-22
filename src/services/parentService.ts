import path from "path";
import mongoose from "mongoose";
import { StudentModel, StudentDocument } from "../models/student";
import { ParentLinkModel, ParentLinkDocument } from "../models/parentLink";
import { OnlineTestModel } from "../models/onlineTest";
import { TestAttemptModel } from "../models/testAttempt";
import { ClassModel } from "../models/class";

const legacyAuth = require(path.join(__dirname, "..", "..", "utils", "auth"));
const User = require(path.join(__dirname, "..", "..", "Models", "User"));

// ── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Validates that an active parent-child link exists.
 * Throws 403 if no active link is found.
 */
async function validateParentLink(
  parentUserId: string | mongoose.Types.ObjectId,
  childStudentUserId: string | mongoose.Types.ObjectId
): Promise<ParentLinkDocument> {
  const link = await ParentLinkModel.findOne({
    parentUserId: toObjectId(parentUserId),
    studentUserId: toObjectId(childStudentUserId),
    status: "active",
  });

  if (!link) {
    throw Object.assign(
      new Error("not authorized to access this child's data"),
      { status: 403 }
    );
  }

  return link;
}

// ── 1. Register Parent ─────────────────────────────────────────────────────

export async function registerParent(
  email: string,
  password: string,
  name: string
): Promise<{ user: any; token: string }> {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw Object.assign(new Error("email already registered"), { status: 409 });
  }

  const passwordRecord = legacyAuth.createPasswordRecord(password);

  const user = await User.create({
    email: email.toLowerCase(),
    password: passwordRecord,
    firstName: name,
    lastName: "",
  });

  const token: string = legacyAuth.signToken({ sub: email.toLowerCase() });

  return { user, token };
}

// ── 2. Link Child ──────────────────────────────────────────────────────────

export async function linkChild(
  parentUserId: string,
  studentCode: string,
  relationship: string
): Promise<{
  link: ParentLinkDocument;
  studentName: string;
  studentOrgs: StudentDocument["organizations"];
}> {
  const student = await StudentModel.findOne({
    studentCode: studentCode.toUpperCase(),
  });

  if (!student) {
    throw Object.assign(new Error("no student found with this code"), {
      status: 404,
    });
  }

  const studentUser = await User.findById(student.userId);
  if (!studentUser) {
    throw Object.assign(new Error("student user account not found"), {
      status: 404,
    });
  }

  const existingLink = await ParentLinkModel.findOne({
    parentUserId: toObjectId(parentUserId),
    studentUserId: student.userId,
    status: "active",
  });

  if (existingLink) {
    throw Object.assign(new Error("already linked to this child"), {
      status: 409,
    });
  }

  const link = await ParentLinkModel.create({
    parentUserId: toObjectId(parentUserId),
    studentUserId: student.userId,
    studentId: student._id,
    status: "active",
    relationship,
    linkedAt: new Date(),
  });

  return {
    link,
    studentName: studentUser.firstName || "",
    studentOrgs: student.organizations,
  };
}

// ── 3. Unlink Child ────────────────────────────────────────────────────────

export async function unlinkChild(
  parentUserId: string,
  studentUserId: string
): Promise<ParentLinkDocument> {
  const link = await ParentLinkModel.findOne({
    parentUserId: toObjectId(parentUserId),
    studentUserId: toObjectId(studentUserId),
    status: "active",
  });

  if (!link) {
    throw Object.assign(new Error("link not found"), { status: 404 });
  }

  link.status = "revoked";
  link.revokedAt = new Date();
  await link.save();

  return link;
}

// ── 4. Get Linked Children ─────────────────────────────────────────────────

export async function getLinkedChildren(
  parentUserId: string
): Promise<
  Array<{
    student: {
      userId: mongoose.Types.ObjectId;
      studentId: mongoose.Types.ObjectId;
      name: string;
      studentCode: string;
      yearGroup: string;
      school: string;
      organizations: StudentDocument["organizations"];
      stats: StudentDocument["stats"];
    };
    relationship: string;
    linkedAt: Date;
  }>
> {
  const links = await ParentLinkModel.find({
    parentUserId: toObjectId(parentUserId),
    status: "active",
  });

  const children = [];

  for (const link of links) {
    const student = await StudentModel.findById(link.studentId);
    const user = await User.findById(link.studentUserId);

    if (!student || !user) continue;

    children.push({
      student: {
        userId: link.studentUserId,
        studentId: link.studentId,
        name: [user.firstName, user.lastName].filter(Boolean).join(" "),
        studentCode: student.studentCode,
        yearGroup: student.yearGroup,
        school: student.school,
        organizations: student.organizations,
        stats: student.stats,
      },
      relationship: link.relationship,
      linkedAt: link.linkedAt,
    });
  }

  return children;
}

// ── 5. Get Parent Dashboard ────────────────────────────────────────────────

export async function getParentDashboard(parentUserId: string): Promise<{
  children: Array<{
    student: any;
    recentResults: any[];
    upcomingTests: any[];
    stats: any;
    alerts: Array<{ type: string; message: string }>;
  }>;
}> {
  const linkedChildren = await getLinkedChildren(parentUserId);

  const childrenData = [];
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const child of linkedChildren) {
    // Recent results: last 3 completed attempts
    const recentAttempts = await TestAttemptModel.find({
      studentId: child.student.studentId,
      status: { $in: ["submitted", "auto_submitted", "graded"] },
    })
      .sort({ submittedAt: -1 })
      .limit(3)
      .lean();

    const recentResults = [];
    for (const attempt of recentAttempts) {
      const test = await OnlineTestModel.findById(attempt.testId)
        .select("title options")
        .lean();
      if (test && test.options?.showResultsToParents !== false) {
        recentResults.push({
          testId: attempt.testId,
          testTitle: test.title,
          attemptNumber: attempt.attemptNumber,
          score: attempt.result?.percentage ?? null,
          marksObtained: attempt.result?.marksObtained ?? null,
          totalMarks: attempt.result?.totalMarks ?? null,
          submittedAt: attempt.submittedAt,
        });
      }
    }

    // Upcoming tests: next 2 scheduled/live tests assigned to student
    // Students can be assigned directly or via classes
    const studentClasses = await ClassModel.find({
      students: child.student.studentId,
      isActive: true,
    }).select("_id");
    const classIds = studentClasses.map((c: any) => c._id);

    const upcomingTests = await OnlineTestModel.find({
      status: { $in: ["scheduled", "live"] },
      $or: [
        { "assignment.studentIds": child.student.studentId },
        { "assignment.classIds": { $in: classIds } },
        { "assignment.isPublic": true },
      ],
    })
      .sort({ "scheduling.startTime": 1 })
      .limit(2)
      .select("title mode scheduling.startTime scheduling.duration status")
      .lean();

    // Stats from student record
    const stats = {
      streak: child.student.stats?.currentStreak ?? 0,
      totalTests: child.student.stats?.totalTestsTaken ?? 0,
      average: child.student.stats?.averageScore ?? 0,
    };

    // Alerts
    const alerts: Array<{ type: string; message: string }> = [];

    // Check for new results in the last 24 hours
    const recentCompletedCount = await TestAttemptModel.countDocuments({
      studentId: child.student.studentId,
      status: { $in: ["submitted", "auto_submitted", "graded"] },
      submittedAt: { $gte: twentyFourHoursAgo },
    });
    if (recentCompletedCount > 0) {
      alerts.push({
        type: "new_results",
        message: "New results available",
      });
    }

    // Placeholder for overdue homework alerts
    // TODO: integrate homework model when overdue tracking is implemented

    childrenData.push({
      student: child.student,
      recentResults,
      upcomingTests,
      stats,
      alerts,
    });
  }

  return { children: childrenData };
}

// ── 6. Get Child Tests ─────────────────────────────────────────────────────

interface TestFilters {
  status?: string;
  mode?: string;
  orgId?: string;
}

interface Pagination {
  page?: number;
  pageSize?: number;
}

export async function getChildTests(
  parentUserId: string,
  childStudentUserId: string,
  filters?: TestFilters,
  pagination?: Pagination
): Promise<{ tests: any[]; total: number; page: number; pageSize: number }> {
  await validateParentLink(parentUserId, childStudentUserId);

  const student = await StudentModel.findOne({
    userId: toObjectId(childStudentUserId),
  });
  if (!student) {
    throw Object.assign(new Error("student not found"), { status: 404 });
  }

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  // Find classes the student belongs to
  const studentClasses = await ClassModel.find({
    students: student._id,
    isActive: true,
  }).select("_id");
  const classIds = studentClasses.map((c: any) => c._id);

  // Build query for tests assigned to this student
  const query: Record<string, unknown> = {
    $or: [
      { "assignment.studentIds": student._id },
      { "assignment.classIds": { $in: classIds } },
      { "assignment.isPublic": true },
    ],
  };

  if (filters?.status) {
    query.status = filters.status;
  }
  if (filters?.mode) {
    query.mode = filters.mode;
  }
  if (filters?.orgId) {
    query.companyId = toObjectId(filters.orgId);
  }

  const [tests, total] = await Promise.all([
    OnlineTestModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select(
        "title description mode status scheduling totalMarks totalQuestions companyId"
      )
      .lean(),
    OnlineTestModel.countDocuments(query),
  ]);

  return { tests, total, page, pageSize };
}

// ── 7. Get Child Results ───────────────────────────────────────────────────

interface ResultFilters {
  orgId?: string;
  dateRange?: { from?: string; to?: string };
  subject?: string;
}

export async function getChildResults(
  parentUserId: string,
  childStudentUserId: string,
  filters?: ResultFilters,
  pagination?: Pagination
): Promise<{ results: any[]; total: number; page: number; pageSize: number }> {
  await validateParentLink(parentUserId, childStudentUserId);

  const student = await StudentModel.findOne({
    userId: toObjectId(childStudentUserId),
  });
  if (!student) {
    throw Object.assign(new Error("student not found"), { status: 404 });
  }

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  // Build base query for completed attempts
  const attemptQuery: Record<string, unknown> = {
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
  };

  if (filters?.orgId) {
    attemptQuery.companyId = toObjectId(filters.orgId);
  }
  if (filters?.dateRange) {
    const range: Record<string, Date> = {};
    if (filters.dateRange.from) range.$gte = new Date(filters.dateRange.from);
    if (filters.dateRange.to) range.$lte = new Date(filters.dateRange.to);
    if (Object.keys(range).length > 0) {
      attemptQuery.submittedAt = range;
    }
  }

  // Fetch all matching attempts first (we need to filter by parent visibility)
  const allAttempts = await TestAttemptModel.find(attemptQuery)
    .sort({ submittedAt: -1 })
    .lean();

  // Filter out tests where showResultsToParents is false
  const visibleResults: any[] = [];
  for (const attempt of allAttempts) {
    const test = await OnlineTestModel.findById(attempt.testId)
      .select("title options companyId")
      .lean();

    if (!test) continue;
    if (test.options?.showResultsToParents === false) continue;

    // Apply subject filter if specified
    if (filters?.subject) {
      const hasSubject = attempt.result?.subjectScores?.some(
        (ss: any) =>
          ss.subjectId === filters.subject ||
          ss.subjectName?.toLowerCase() === filters.subject?.toLowerCase()
      );
      if (!hasSubject) continue;
    }

    visibleResults.push({
      attemptId: attempt._id,
      testId: attempt.testId,
      testTitle: test.title,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      result: attempt.result,
      companyId: test.companyId,
    });
  }

  const total = visibleResults.length;
  const paginatedResults = visibleResults.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return { results: paginatedResults, total, page, pageSize };
}

// ── 8. Get Child Result Detail ─────────────────────────────────────────────

export async function getChildResultDetail(
  parentUserId: string,
  childStudentUserId: string,
  testId: string,
  attemptNumber?: number
): Promise<{
  attempt: any;
  test: any;
}> {
  await validateParentLink(parentUserId, childStudentUserId);

  const student = await StudentModel.findOne({
    userId: toObjectId(childStudentUserId),
  });
  if (!student) {
    throw Object.assign(new Error("student not found"), { status: 404 });
  }

  const test = await OnlineTestModel.findById(toObjectId(testId));
  if (!test) {
    throw Object.assign(new Error("test not found"), { status: 404 });
  }

  if (test.options?.showResultsToParents === false) {
    throw Object.assign(
      new Error("results not available to parents for this test"),
      { status: 403 }
    );
  }

  // Build attempt query
  const attemptQuery: Record<string, unknown> = {
    testId: toObjectId(testId),
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
  };

  if (attemptNumber !== undefined) {
    attemptQuery.attemptNumber = attemptNumber;
  }

  const attempt = await TestAttemptModel.findOne(attemptQuery)
    .sort({ attemptNumber: -1 })
    .lean();

  if (!attempt) {
    throw Object.assign(new Error("attempt not found"), { status: 404 });
  }

  return {
    attempt: {
      attemptId: attempt._id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      result: attempt.result,
      answers: attempt.answers,
      sections: attempt.sections,
    },
    test: {
      testId: test._id,
      title: test.title,
      description: test.description,
      mode: test.mode,
      totalMarks: test.totalMarks,
      totalQuestions: test.totalQuestions,
      options: {
        showSolutionsAfterCompletion: test.options.showSolutionsAfterCompletion,
        allowReview: test.options.allowReview,
        passingScore: test.options.passingScore,
      },
    },
  };
}

// ── 9. Get Child Performance ───────────────────────────────────────────────

export async function getChildPerformance(
  parentUserId: string,
  childStudentUserId: string,
  orgId?: string
): Promise<{
  scoreTrend: Array<{ date: string; score: number }>;
  subjectBreakdown: Array<{
    subjectId: string;
    subjectName: string;
    averageScore: number;
    totalAttempts: number;
  }>;
  difficultyAnalysis: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
  timeAnalysis: {
    averageTimePerQuestion: number;
    averageTotalTime: number;
  };
}> {
  await validateParentLink(parentUserId, childStudentUserId);

  const student = await StudentModel.findOne({
    userId: toObjectId(childStudentUserId),
  });
  if (!student) {
    throw Object.assign(new Error("student not found"), { status: 404 });
  }

  // Build query for completed attempts
  const matchStage: Record<string, unknown> = {
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  };

  if (orgId) {
    matchStage.companyId = toObjectId(orgId);
  }

  // Score trend: aggregate by date
  const scoreTrendAgg = await TestAttemptModel.aggregate([
    { $match: matchStage },
    { $sort: { submittedAt: 1 } },
    {
      $project: {
        date: {
          $dateToString: { format: "%Y-%m-%d", date: "$submittedAt" },
        },
        score: "$result.percentage",
      },
    },
    {
      $group: {
        _id: "$date",
        score: { $avg: "$score" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const scoreTrend = scoreTrendAgg.map((item: any) => ({
    date: item._id,
    score: Math.round(item.score * 100) / 100,
  }));

  // Subject breakdown: from subjectScores in results
  const subjectAgg = await TestAttemptModel.aggregate([
    { $match: matchStage },
    { $unwind: "$result.subjectScores" },
    {
      $group: {
        _id: {
          subjectId: "$result.subjectScores.subjectId",
          subjectName: "$result.subjectScores.subjectName",
        },
        averageScore: { $avg: "$result.subjectScores.percentage" },
        totalAttempts: { $sum: 1 },
      },
    },
    { $sort: { "_id.subjectName": 1 } },
  ]);

  const subjectBreakdown = subjectAgg.map((item: any) => ({
    subjectId: item._id.subjectId,
    subjectName: item._id.subjectName,
    averageScore: Math.round(item.averageScore * 100) / 100,
    totalAttempts: item.totalAttempts,
  }));

  // Difficulty analysis: aggregate from answers and question metadata
  const attempts = await TestAttemptModel.find(matchStage)
    .select("answers")
    .lean();

  const difficultyBuckets: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
    [key: string]: { correct: number; total: number };
  } = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 },
  };

  // Collect all unique question IDs from answers
  const allQuestionIds = new Set<string>();
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      allQuestionIds.add(answer.questionId.toString());
    }
  }

  // Fetch question difficulty metadata in bulk
  const questions = await mongoose.model("Question").find({
    _id: { $in: Array.from(allQuestionIds).map(toObjectId) },
  }).select("metadata").lean();

  const questionDifficultyMap = new Map<string, string>();
  for (const q of questions) {
    const qAny = q as any;
    const difficulty =
      qAny.metadata?.difficulty?.toLowerCase() || "medium";
    questionDifficultyMap.set(String(qAny._id), difficulty);
  }

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const difficulty =
        questionDifficultyMap.get(answer.questionId.toString()) || "medium";
      const bucket =
        difficultyBuckets[difficulty] || difficultyBuckets["medium"];
      bucket.total += 1;
      if (answer.isCorrect) {
        bucket.correct += 1;
      }
    }
  }

  // Time analysis
  const timeAgg = await TestAttemptModel.aggregate([
    { $match: matchStage },
    { $unwind: "$answers" },
    {
      $group: {
        _id: null,
        avgTimePerQuestion: { $avg: "$answers.timeSpent" },
        totalQuestions: { $sum: 1 },
      },
    },
  ]);

  const totalTimeAgg = await TestAttemptModel.aggregate([
    { $match: matchStage },
    {
      $project: {
        totalTime: { $sum: "$answers.timeSpent" },
      },
    },
    {
      $group: {
        _id: null,
        avgTotalTime: { $avg: "$totalTime" },
      },
    },
  ]);

  const timeAnalysis = {
    averageTimePerQuestion: Math.round(
      (timeAgg[0]?.avgTimePerQuestion ?? 0) * 100
    ) / 100,
    averageTotalTime: Math.round(
      (totalTimeAgg[0]?.avgTotalTime ?? 0) * 100
    ) / 100,
  };

  return {
    scoreTrend,
    subjectBreakdown,
    difficultyAnalysis: difficultyBuckets,
    timeAnalysis,
  };
}
