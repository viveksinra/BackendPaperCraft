import path from "path";
import mongoose from "mongoose";
import { StudentModel, StudentDocument } from "../models/student";
import { ParentLinkModel } from "../models/parentLink";
import { OnlineTestModel, OnlineTestDocument } from "../models/onlineTest";
import { TestAttemptModel, TestAttemptDocument } from "../models/testAttempt";
import { QuestionModel } from "../models/question";
import { ClassModel } from "../models/class";

const legacyAuth = require(path.join(__dirname, "..", "..", "utils", "auth"));
const User = require(path.join(__dirname, "..", "..", "Models", "User"));
const Membership = require(path.join(__dirname, "..", "..", "Models", "Membership"));
const Company = require(path.join(__dirname, "..", "..", "Models", "Company"));

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Find the Student document for a given userId, or auto-create one if the user
 * exists and has a student Membership but no Student record (data gap from old
 * team-invite system).
 */
async function findOrCreateStudent(userId: string): Promise<import("../models/student").StudentDocument> {
  const oid = toObjectId(userId);
  let student = await StudentModel.findOne({ userId: oid });
  if (student) return student;

  // No Student doc — check if the user exists at all
  const user = await User.findById(oid);
  if (!user) {
    throw Object.assign(new Error("User account not found"), { status: 404 });
  }

  // Auto-create Student document — the isStudent middleware already verified
  // the user has a valid student role (Membership, registeredAs, etc.)
  const memberships = await Membership.find({ userEmail: user.email, role: "student" });

  // Build organizations from existing memberships
  const orgs: any[] = [];
  for (const m of memberships) {
    const company = await Company.findById(m.companyId);
    if (company) {
      orgs.push({
        companyId: company._id,
        tenantId: company.slug || "default",
        joinedAt: m.createdAt || new Date(),
        role: "student",
        orgName: company.name,
        isActive: true,
      });
    }
  }

  const studentCode = await generateStudentCode();
  student = await StudentModel.create({
    userId: oid,
    studentCode,
    organizations: orgs,
  });

  return student;
}

// ─── 1. Generate Student Code ───────────────────────────────────────────────

const STUDENT_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STUDENT_CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 10;

export async function generateStudentCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    let code = "STU-";
    for (let i = 0; i < STUDENT_CODE_LENGTH; i++) {
      const idx = Math.floor(Math.random() * STUDENT_CODE_CHARSET.length);
      code += STUDENT_CODE_CHARSET[idx];
    }

    const existing = await StudentModel.findOne({ studentCode: code });
    if (!existing) {
      return code;
    }
  }

  throw Object.assign(
    new Error("Failed to generate a unique student code after maximum retries"),
    { status: 500 }
  );
}

// ─── 2. Register Student ────────────────────────────────────────────────────

export async function registerStudent(
  email: string,
  password: string,
  name: string,
  orgCode: string
): Promise<{ user: any; student: StudentDocument; token: string }> {
  // Look up company by username (case-insensitive)
  const company = await Company.findOne({
    username: { $regex: new RegExp(`^${orgCode}$`, "i") },
  });
  if (!company) {
    throw Object.assign(new Error("Invalid organization code"), { status: 404 });
  }

  // Check if user with email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }

  // Create password record
  const passwordRecord = legacyAuth.createPasswordRecord(password);

  // Create user
  const user = await User.create({
    email: email.toLowerCase(),
    password: passwordRecord,
    firstName: name,
    lastName: "",
  });

  // Generate unique student code
  const studentCode = await generateStudentCode();

  // Create student document
  const student = await StudentModel.create({
    userId: user._id,
    studentCode,
    organizations: [
      {
        companyId: company._id,
        tenantId: company.slug || "default",
        joinedAt: new Date(),
        role: "student",
        orgName: company.name,
        isActive: true,
      },
    ],
  });

  // Create membership
  await Membership.create({
    companyId: company._id,
    userEmail: email.toLowerCase(),
    role: "student",
  });

  // Generate JWT token
  const token = legacyAuth.signToken({ sub: email.toLowerCase() });

  return { user, student, token };
}

// ─── 3. Join Organization ───────────────────────────────────────────────────

export async function joinOrganization(
  studentUserId: string,
  orgCode: string
): Promise<StudentDocument> {
  const student = await findOrCreateStudent(studentUserId);

  const company = await Company.findOne({
    username: { $regex: new RegExp(`^${orgCode}$`, "i") },
  });
  if (!company) {
    throw Object.assign(new Error("Invalid organization code"), { status: 404 });
  }

  // Check if already a member via student organizations array
  const alreadyInOrgs = student.organizations.some(
    (org) => org.companyId.toString() === company._id.toString()
  );
  if (alreadyInOrgs) {
    throw Object.assign(
      new Error("Already a member of this organization"),
      { status: 409 }
    );
  }

  // Check if existing membership record exists
  const existingMembership = await Membership.findOne({
    companyId: company._id,
    userEmail: (await User.findById(toObjectId(studentUserId)))?.email,
  });
  if (existingMembership) {
    throw Object.assign(
      new Error("Already a member of this organization"),
      { status: 409 }
    );
  }

  // Create membership
  const user = await User.findById(toObjectId(studentUserId));
  await Membership.create({
    companyId: company._id,
    userEmail: user.email,
    role: "student",
  });

  // Push new org entry
  student.organizations.push({
    companyId: company._id,
    tenantId: company.slug || "default",
    joinedAt: new Date(),
    role: "student",
    orgName: company.name,
    isActive: true,
  });

  await student.save();
  return student;
}

// ─── 4. Get Student Profile ─────────────────────────────────────────────────

export async function getStudentProfile(
  studentUserId: string
): Promise<Record<string, unknown>> {
  const student = await findOrCreateStudent(studentUserId);

  const user = await User.findById(toObjectId(studentUserId)).select(
    "email firstName lastName"
  );
  if (!user) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }

  const studentObj = student.toObject();

  return {
    ...studentObj,
    email: user.email,
    name: user.firstName,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

// ─── 5. Update Student Profile ──────────────────────────────────────────────

interface UpdateProfileInput {
  dateOfBirth?: string | Date;
  yearGroup?: string;
  school?: string;
  name?: string;
  preferences?: {
    showTimerWarning?: boolean;
    questionFontSize?: "small" | "medium" | "large";
    highContrastMode?: boolean;
  };
}

export async function updateStudentProfile(
  studentUserId: string,
  input: UpdateProfileInput
): Promise<StudentDocument> {
  const student = await findOrCreateStudent(studentUserId);

  // Update allowed fields
  if (input.dateOfBirth !== undefined) {
    student.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  }
  if (input.yearGroup !== undefined) {
    student.yearGroup = input.yearGroup;
  }
  if (input.school !== undefined) {
    student.school = input.school;
  }

  // Update user firstName if name is provided
  if (input.name) {
    await User.findByIdAndUpdate(toObjectId(studentUserId), {
      firstName: input.name,
    });
  }

  // Merge preferences if provided
  if (input.preferences) {
    const existing = student.preferences || {
      showTimerWarning: true,
      questionFontSize: "medium" as const,
      highContrastMode: false,
    };
    student.preferences = {
      showTimerWarning:
        input.preferences.showTimerWarning ?? existing.showTimerWarning,
      questionFontSize:
        input.preferences.questionFontSize ?? existing.questionFontSize,
      highContrastMode:
        input.preferences.highContrastMode ?? existing.highContrastMode,
    };
  }

  await student.save();
  return student;
}

// ─── 6. Get Student Dashboard ───────────────────────────────────────────────

export async function getStudentDashboard(
  studentUserId: string
): Promise<Record<string, unknown>> {
  const student = await findOrCreateStudent(studentUserId);

  const companyIds = student.organizations
    .filter((org) => org.isActive)
    .map((org) => org.companyId);

  // Find classes the student belongs to
  const studentClasses = await ClassModel.find({
    students: student._id,
    companyId: { $in: companyIds },
  }).select("_id");
  const classIds = studentClasses.map((c) => c._id);

  // Upcoming tests: assigned to student via studentIds or classIds, status scheduled or live
  const upcomingTests = await OnlineTestModel.find({
    companyId: { $in: companyIds },
    status: { $in: ["scheduled", "live"] },
    $or: [
      { "assignment.studentIds": student._id },
      { "assignment.classIds": { $in: classIds } },
      { "assignment.isPublic": true },
    ],
  })
    .sort({ "scheduling.startTime": 1 })
    .limit(5)
    .select("title mode status scheduling.startTime scheduling.duration companyId")
    .lean();

  // Recent results: completed attempts for this student
  const recentResults = await TestAttemptModel.find({
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  })
    .sort({ submittedAt: -1 })
    .limit(5)
    .populate("testId", "title mode")
    .lean();

  const formattedResults = recentResults.map((attempt: any) => ({
    attemptId: attempt._id,
    testId: attempt.testId?._id || attempt.testId,
    testName: attempt.testId?.title || "Unknown Test",
    mode: attempt.testId?.mode,
    score: attempt.result?.percentage ?? 0,
    marksObtained: attempt.result?.marksObtained ?? 0,
    totalMarks: attempt.result?.totalMarks ?? 0,
    completedAt: attempt.submittedAt,
  }));

  return {
    upcomingTests,
    recentResults: formattedResults,
    pendingHomework: [],
    stats: student.stats,
  };
}

// ─── 7. Get Student Tests ───────────────────────────────────────────────────

interface StudentTestFilters {
  status?: "upcoming" | "available" | "completed";
  mode?: string;
  orgId?: string;
}

interface PaginationOpts {
  page?: number;
  pageSize?: number;
}

export async function getStudentTests(
  studentUserId: string,
  filters?: StudentTestFilters,
  pagination?: PaginationOpts
): Promise<{ tests: any[]; total: number; page: number; pageSize: number }> {
  const student = await findOrCreateStudent(studentUserId);

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  const companyIds = filters?.orgId
    ? [toObjectId(filters.orgId)]
    : student.organizations.filter((org) => org.isActive).map((org) => org.companyId);

  // Find classes the student belongs to
  const studentClasses = await ClassModel.find({
    students: student._id,
    companyId: { $in: companyIds },
  }).select("_id");
  const classIds = studentClasses.map((c) => c._id);

  // Handle "completed" filter specially via TestAttempt lookup
  if (filters?.status === "completed") {
    const attemptQuery: Record<string, unknown> = {
      studentId: student._id,
      status: { $in: ["submitted", "auto_submitted", "graded"] },
    };

    const [attempts, total] = await Promise.all([
      TestAttemptModel.find(attemptQuery)
        .sort({ submittedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate("testId", "title mode status scheduling companyId")
        .lean(),
      TestAttemptModel.countDocuments(attemptQuery),
    ]);

    const tests = attempts.map((a: any) => ({
      testId: a.testId?._id || a.testId,
      title: a.testId?.title || "Unknown Test",
      mode: a.testId?.mode,
      status: "completed",
      attemptId: a._id,
      score: a.result?.percentage,
      completedAt: a.submittedAt,
    }));

    return { tests, total, page, pageSize };
  }

  // Build query for upcoming / available
  const query: Record<string, unknown> = {
    companyId: { $in: companyIds },
    $or: [
      { "assignment.studentIds": student._id },
      { "assignment.classIds": { $in: classIds } },
      { "assignment.isPublic": true },
    ],
  };

  if (filters?.status === "upcoming") {
    query.status = { $in: ["scheduled"] };
  } else if (filters?.status === "available") {
    query.status = "live";
  }

  if (filters?.mode) {
    query.mode = filters.mode;
  }

  const [tests, total] = await Promise.all([
    OnlineTestModel.find(query)
      .sort({ "scheduling.startTime": 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select("title mode status scheduling companyId totalMarks totalQuestions")
      .lean(),
    OnlineTestModel.countDocuments(query),
  ]);

  return { tests, total, page, pageSize };
}

// ─── 8. Get Student Results ─────────────────────────────────────────────────

interface StudentResultFilters {
  orgId?: string;
  dateRange?: { from?: string; to?: string };
  subject?: string;
}

export async function getStudentResults(
  studentUserId: string,
  filters?: StudentResultFilters,
  pagination?: PaginationOpts
): Promise<{ results: any[]; total: number; page: number; pageSize: number }> {
  const student = await findOrCreateStudent(studentUserId);

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  const query: Record<string, unknown> = {
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
  };

  // Filter by orgId
  if (filters?.orgId) {
    query.companyId = toObjectId(filters.orgId);
  }

  // Filter by date range on submittedAt
  if (filters?.dateRange) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateRange.from) dateFilter.$gte = new Date(filters.dateRange.from);
    if (filters.dateRange.to) dateFilter.$lte = new Date(filters.dateRange.to);
    if (Object.keys(dateFilter).length > 0) {
      query.submittedAt = dateFilter;
    }
  }

  const [results, total] = await Promise.all([
    TestAttemptModel.find(query)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("testId", "title mode")
      .lean(),
    TestAttemptModel.countDocuments(query),
  ]);

  // If subject filter is provided, post-filter via populated test subject metadata
  let filteredResults = results;
  if (filters?.subject) {
    filteredResults = results.filter((r: any) => {
      const test = r.testId as any;
      return test?.subject === filters.subject;
    });
  }

  return {
    results: filteredResults,
    total: filters?.subject ? filteredResults.length : total,
    page,
    pageSize,
  };
}

// ─── 9. Get Student Result Detail ───────────────────────────────────────────

export async function getStudentResultDetail(
  studentUserId: string,
  testId: string,
  attemptNumber?: number
): Promise<Record<string, unknown>> {
  const student = await findOrCreateStudent(studentUserId);

  // Find the attempt
  const attemptQuery: Record<string, unknown> = {
    testId: toObjectId(testId),
    studentId: student._id,
  };

  if (attemptNumber !== undefined) {
    attemptQuery.attemptNumber = attemptNumber;
  }

  const attempt = await TestAttemptModel.findOne(attemptQuery).sort({
    attemptNumber: -1,
  });

  if (!attempt) {
    throw Object.assign(new Error("Test attempt not found"), { status: 404 });
  }

  // Get the test for metadata and showSolutions flag
  const test = await OnlineTestModel.findById(toObjectId(testId));
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  const showSolutions = test.options.showSolutionsAfterCompletion;

  // Fetch all questions referenced in the attempt answers
  const questionIds = attempt.answers.map((a) => a.questionId);
  const questions = await QuestionModel.find({
    _id: { $in: questionIds },
  }).lean();

  const questionsById = new Map(
    questions.map((q: any) => [q._id.toString(), q])
  );

  // Build question-by-question breakdown
  const breakdown = attempt.answers.map((ans) => {
    const question = questionsById.get(ans.questionId.toString());
    const content = (question?.content || {}) as Record<string, unknown>;

    const entry: Record<string, unknown> = {
      questionId: ans.questionId,
      sectionIndex: ans.sectionIndex,
      questionType: question?.type || "unknown",
      questionContent: content.text || content.question || null,
      studentAnswer: ans.answer,
      isCorrect: ans.isCorrect,
      marksAwarded: ans.marksAwarded,
      maxMarks: ans.maxMarks,
      timeSpent: ans.timeSpent,
      feedback: ans.feedback,
    };

    // Only include correct answer and solution if showSolutions is enabled
    if (showSolutions) {
      entry.correctAnswer = content.correctAnswer || null;
      entry.solution = content.solution || null;
    }

    return entry;
  });

  return {
    attemptId: attempt._id!.toString(),
    testId: test._id!.toString(),
    testTitle: test.title,
    testMode: test.mode,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    result: attempt.result,
    breakdown,
    showSolutions,
  };
}

// ─── 10. Get Student Performance ────────────────────────────────────────────

export async function getStudentPerformance(
  studentUserId: string,
  orgId?: string
): Promise<Record<string, unknown>> {
  const student = await findOrCreateStudent(studentUserId);

  // Get completed attempts
  const attemptQuery: Record<string, unknown> = {
    studentId: student._id,
    status: { $in: ["submitted", "auto_submitted", "graded"] },
    result: { $ne: null },
  };

  if (orgId) {
    attemptQuery.companyId = toObjectId(orgId);
  }

  const attempts = await TestAttemptModel.find(attemptQuery)
    .sort({ submittedAt: -1 })
    .populate("testId", "title mode companyId")
    .lean();

  // ── Score Trend: last 20 completed attempts ───────────────────────────────
  const scoreTrend = attempts.slice(0, 20).map((a: any) => ({
    testName: a.testId?.title || "Unknown Test",
    score: a.result?.percentage ?? 0,
    date: a.submittedAt,
  }));

  // ── Subject Breakdown: aggregate average score per subject ────────────────
  const subjectMap = new Map<string, { total: number; count: number }>();

  for (const attempt of attempts) {
    const result = attempt.result;
    if (result?.subjectScores) {
      for (const ss of result.subjectScores) {
        const key = ss.subjectName || ss.subjectId;
        const existing = subjectMap.get(key) || { total: 0, count: 0 };
        existing.total += ss.percentage;
        existing.count += 1;
        subjectMap.set(key, existing);
      }
    }
  }

  const subjectBreakdown = Array.from(subjectMap.entries()).map(
    ([subject, data]) => ({
      subject,
      averageScore: Math.round((data.total / data.count) * 100) / 100,
      testCount: data.count,
    })
  );

  // ── Difficulty Analysis: correct rate by difficulty level ──────────────────
  // Collect all question IDs from all attempts
  const allQuestionIds: mongoose.Types.ObjectId[] = [];
  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      allQuestionIds.push(ans.questionId);
    }
  }

  const questionsForDifficulty = await QuestionModel.find({
    _id: { $in: allQuestionIds },
  })
    .select("metadata")
    .lean();

  const difficultyMap = new Map<
    string,
    { correct: number; total: number }
  >();

  const questionDifficultyById = new Map(
    questionsForDifficulty.map((q: any) => [
      q._id.toString(),
      (q.metadata?.difficulty as string) || "medium",
    ])
  );

  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      const difficulty =
        questionDifficultyById.get(ans.questionId.toString()) || "medium";
      const existing = difficultyMap.get(difficulty) || {
        correct: 0,
        total: 0,
      };
      existing.total += 1;
      if (ans.isCorrect) {
        existing.correct += 1;
      }
      difficultyMap.set(difficulty, existing);
    }
  }

  const difficultyAnalysis = Array.from(difficultyMap.entries()).map(
    ([difficulty, data]) => ({
      difficulty,
      correctRate:
        data.total > 0
          ? Math.round((data.correct / data.total) * 10000) / 100
          : 0,
      totalQuestions: data.total,
      correctCount: data.correct,
    })
  );

  // ── Time Analysis ─────────────────────────────────────────────────────────
  let totalTimeSpent = 0;
  let totalAnswers = 0;

  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      totalTimeSpent += ans.timeSpent || 0;
      totalAnswers += 1;
    }
  }

  const timeAnalysis = {
    averageTimePerQuestion:
      totalAnswers > 0 ? Math.round(totalTimeSpent / totalAnswers) : 0,
  };

  return {
    scoreTrend,
    subjectBreakdown,
    difficultyAnalysis,
    timeAnalysis,
  };
}

// ─── 11. Update Student Streak ──────────────────────────────────────────────

export async function updateStudentStreak(
  studentUserId: string
): Promise<StudentDocument> {
  const student = await findOrCreateStudent(studentUserId);

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const lastActivity = student.stats.lastActivityAt;

  if (lastActivity) {
    const startOfLastActivity = new Date(
      lastActivity.getFullYear(),
      lastActivity.getMonth(),
      lastActivity.getDate()
    );

    const diffMs = startOfToday.getTime() - startOfLastActivity.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays === 0) {
      // Same day, no change to streak
      return student;
    } else if (diffDays === 1) {
      // Consecutive day
      student.stats.currentStreak += 1;
    } else {
      // Gap of more than 1 day
      student.stats.currentStreak = 1;
    }
  } else {
    // No previous activity
    student.stats.currentStreak = 1;
  }

  // Update longest streak if current exceeds it
  if (student.stats.currentStreak > student.stats.longestStreak) {
    student.stats.longestStreak = student.stats.currentStreak;
  }

  student.stats.lastActivityAt = now;
  await student.save();
  return student;
}
