import mongoose from "mongoose";
import { OnlineTestModel, OnlineTestDocument, TestMode } from "../models/onlineTest";
import { TestAttemptModel } from "../models/testAttempt";
import { PaperModel } from "../models/paper";
import { QuestionModel } from "../models/question";
import { emitTestEvent, emitToMonitor, getIO } from "../shared/socket/socketServer";
import { addGoLiveJob } from "../queue/testSchedulerQueue";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

const SUBJECTIVE_TYPES = ["short_answer", "long_answer", "creative_writing", "essay"];

async function getConnectedCount(testId: string): Promise<number> {
  const io = getIO();
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get(`test:${testId}`);
  return room ? room.size : 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function recalculateTotals(
  sections: { questionIds: mongoose.Types.ObjectId[] }[]
): Promise<{ totalMarks: number; totalQuestions: number }> {
  const allQuestionIds = sections.flatMap((s) => s.questionIds);
  let totalMarks = 0;
  const totalQuestions = allQuestionIds.length;

  if (allQuestionIds.length > 0) {
    const questions = await QuestionModel.find({
      _id: { $in: allQuestionIds },
    });
    for (const q of questions) {
      totalMarks += (q.metadata as Record<string, number>)?.marks ?? 0;
    }
  }

  return { totalMarks, totalQuestions };
}

async function detectManualGrading(
  sections: { questionIds: mongoose.Types.ObjectId[] }[]
): Promise<boolean> {
  const allQuestionIds = sections.flatMap((s) => s.questionIds);
  if (allQuestionIds.length === 0) return false;

  const subjectiveCount = await QuestionModel.countDocuments({
    _id: { $in: allQuestionIds },
    type: { $in: SUBJECTIVE_TYPES },
  });
  return subjectiveCount > 0;
}

function applyModeDefaults(
  mode: TestMode,
  options: Record<string, unknown>,
  assignment: Record<string, unknown>
): { options: Record<string, unknown>; assignment: Record<string, unknown> } {
  const opts = { ...options };
  const assign = { ...assignment };

  switch (mode) {
    case "practice":
      opts.instantFeedback = opts.instantFeedback ?? true;
      opts.maxAttempts = opts.maxAttempts ?? 999;
      break;
    case "section_timed":
      // sections default canGoBack=false is handled at section level
      break;
    case "classroom":
      assign.isPublic = assign.isPublic ?? false;
      break;
  }

  return { options: opts, assignment: assign };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createTest(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<OnlineTestDocument> {
  let sections: Array<{
    name: string;
    questionIds: mongoose.Types.ObjectId[];
    timeLimit: number;
    instructions: string;
    canGoBack: boolean;
  }> = [];

  const mode = input.mode as TestMode;

  // Import from Paper if paperId is provided
  if (input.paperId) {
    const paper = await PaperModel.findOne({
      _id: toObjectId(input.paperId as string),
      companyId: toObjectId(companyId),
    });
    if (!paper) {
      throw Object.assign(new Error("Paper not found"), { status: 404 });
    }

    sections = paper.sections.map((s) => ({
      name: s.name,
      questionIds: s.questions.map((q) => q.questionId),
      timeLimit: s.timeLimit || 0,
      instructions: s.instructions || "",
      canGoBack: mode === "section_timed" ? false : true,
    }));
  } else if (input.sections) {
    // Ad-hoc: validate questionIds exist
    const rawSections = input.sections as Array<{
      name: string;
      questionIds: string[];
      timeLimit?: number;
      instructions?: string;
      canGoBack?: boolean;
    }>;

    const allQuestionIds = rawSections.flatMap((s) => s.questionIds);
    if (allQuestionIds.length > 0) {
      const foundCount = await QuestionModel.countDocuments({
        _id: { $in: allQuestionIds.map(toObjectId) },
        companyId: toObjectId(companyId),
        isArchived: false,
      });
      if (foundCount !== allQuestionIds.length) {
        throw Object.assign(
          new Error("One or more questions not found or archived"),
          { status: 400 }
        );
      }
    }

    sections = rawSections.map((s) => ({
      name: s.name,
      questionIds: s.questionIds.map(toObjectId),
      timeLimit: s.timeLimit ?? 0,
      instructions: s.instructions ?? "",
      canGoBack: mode === "section_timed" ? false : (s.canGoBack ?? true),
    }));
  }

  // Calculate totals
  const { totalMarks, totalQuestions } = await recalculateTotals(sections);

  // Detect subjective questions for manual grading
  const requireManualGrading = await detectManualGrading(sections);

  // Apply mode-specific defaults
  const { options: mergedOptions, assignment: mergedAssignment } = applyModeDefaults(
    mode,
    (input.options as Record<string, unknown>) ?? {},
    (input.assignment as Record<string, unknown>) ?? {}
  );

  const doc = await OnlineTestModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    title: input.title,
    description: input.description || "",
    paperId: input.paperId ? toObjectId(input.paperId as string) : null,
    mode,
    scheduling: input.scheduling || {},
    sections,
    options: mergedOptions,
    assignment: mergedAssignment,
    grading: {
      requireManualGrading,
      gradingDeadline: (input.grading as Record<string, unknown>)?.gradingDeadline ?? null,
    },
    status: "draft",
    resultsPublished: false,
    totalMarks,
    totalQuestions,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  return doc;
}

// ─── List ───────────────────────────────────────────────────────────────────

interface ListFilters {
  mode?: TestMode;
  status?: string;
  search?: string;
  dateRange?: { from?: string; to?: string };
  classId?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listTests(
  companyId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ items: OnlineTestDocument[]; total: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  if (filters?.mode) query.mode = filters.mode;
  if (filters?.status) query.status = filters.status;
  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }
  if (filters?.classId) {
    query["assignment.classIds"] = toObjectId(filters.classId);
  }
  if (filters?.dateRange) {
    const range: Record<string, Date> = {};
    if (filters.dateRange.from) range.$gte = new Date(filters.dateRange.from);
    if (filters.dateRange.to) range.$lte = new Date(filters.dateRange.to);
    if (Object.keys(range).length > 0) {
      query.createdAt = range;
    }
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortBy = pagination?.sortBy ?? "createdAt";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    OnlineTestModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit),
    OnlineTestModel.countDocuments(query),
  ]);

  return { items, total };
}

// ─── Get by ID ──────────────────────────────────────────────────────────────

export async function getTestById(
  companyId: string,
  testId: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });

  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }
  return doc;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateTest(
  companyId: string,
  testId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (doc.status === "live" || doc.status === "completed") {
    throw Object.assign(
      new Error("Cannot update a test that is live or completed"),
      { status: 400 }
    );
  }

  if (input.title !== undefined) doc.title = input.title as string;
  if (input.description !== undefined) doc.description = input.description as string;
  if (input.mode !== undefined) doc.mode = input.mode as TestMode;
  if (input.scheduling !== undefined) doc.scheduling = input.scheduling as typeof doc.scheduling;
  if (input.options !== undefined) doc.options = input.options as typeof doc.options;
  if (input.assignment !== undefined) doc.assignment = input.assignment as typeof doc.assignment;
  if (input.grading !== undefined) doc.grading = input.grading as typeof doc.grading;

  if (input.sections !== undefined) {
    doc.sections = input.sections as typeof doc.sections;

    // Recalculate totals when sections change
    const { totalMarks, totalQuestions } = await recalculateTotals(doc.sections);
    doc.totalMarks = totalMarks;
    doc.totalQuestions = totalQuestions;

    // Re-detect manual grading
    doc.grading.requireManualGrading = await detectManualGrading(doc.sections);
  }

  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteTest(
  companyId: string,
  testId: string
): Promise<void> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (doc.status === "live") {
    throw Object.assign(
      new Error("Cannot delete a live test. Complete or archive it first."),
      { status: 400 }
    );
  }

  // Block deletion if any attempts exist
  const attemptCount = await TestAttemptModel.countDocuments({
    testId: doc._id,
  });
  if (attemptCount > 0) {
    throw Object.assign(
      new Error("Cannot delete a test with existing attempts. Archive it instead."),
      { status: 400 }
    );
  }

  await OnlineTestModel.deleteOne({ _id: doc._id });
}

// ─── Duplicate ──────────────────────────────────────────────────────────────

export async function duplicateTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  const plain = doc.toObject() as unknown as Record<string, unknown>;

  // Strip mongoose internals
  delete plain._id;
  delete plain.__v;
  delete plain.createdAt;
  delete plain.updatedAt;

  // Reset status and scheduling
  const existingScheduling = plain.scheduling as Record<string, unknown>;
  plain.title = `${plain.title} (Copy)`;
  plain.status = "draft";
  plain.resultsPublished = false;
  plain.scheduling = {
    startTime: null,
    endTime: null,
    availableFrom: null,
    duration: existingScheduling.duration,
  };
  plain.createdBy = userEmail;
  plain.updatedBy = userEmail;

  const copy = await OnlineTestModel.create(plain);
  return copy;
}

// ─── Schedule ───────────────────────────────────────────────────────────────

export async function scheduleTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Validate sections have questions
  if (!doc.sections.length) {
    throw Object.assign(
      new Error("Test must have at least one section"),
      { status: 400 }
    );
  }
  for (const section of doc.sections) {
    if (!section.questionIds.length) {
      throw Object.assign(
        new Error(`Section "${section.name}" has no questions`),
        { status: 400 }
      );
    }
  }

  doc.status = "scheduled";
  doc.updatedBy = userEmail;
  await doc.save();

  // Schedule auto go-live job if startTime is in the future
  if (doc.scheduling.startTime) {
    await addGoLiveJob(testId, doc.scheduling.startTime.toISOString());
  }

  return doc;
}

// ─── Go Live ────────────────────────────────────────────────────────────────

export async function goLive(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  doc.status = "live";
  doc.updatedBy = userEmail;
  await doc.save();

  emitTestEvent(testId, "test:go-live", { testId, status: "live" });

  return doc;
}

// ─── Complete Test ──────────────────────────────────────────────────────────

export async function completeTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  doc.status = "completed";
  doc.updatedBy = userEmail;
  await doc.save();

  // Auto-submit all in-progress attempts
  await TestAttemptModel.updateMany(
    { testId: doc._id, status: "in_progress" },
    { $set: { status: "auto_submitted", submittedAt: new Date() } }
  );

  emitTestEvent(testId, "test:completed", { testId, status: "completed" });

  return doc;
}

// ─── Archive Test ───────────────────────────────────────────────────────────

export async function archiveTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  doc.status = "archived";
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Publish Results ────────────────────────────────────────────────────────

export async function publishResults(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Validate all attempts are graded if manual grading is required
  if (doc.grading.requireManualGrading) {
    const ungradedCount = await TestAttemptModel.countDocuments({
      testId: doc._id,
      status: { $in: ["submitted", "auto_submitted"] },
    });
    if (ungradedCount > 0) {
      throw Object.assign(
        new Error(
          `Cannot publish results: ${ungradedCount} attempt(s) still require grading`
        ),
        { status: 400 }
      );
    }
  }

  doc.resultsPublished = true;
  doc.updatedBy = userEmail;
  await doc.save();

  emitTestEvent(testId, "test:results-published", { testId });

  return doc;
}

// ─── Get Test Stats ─────────────────────────────────────────────────────────

interface TestStats {
  totalAttempts: number;
  completedCount: number;
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
}

export async function getTestStats(
  companyId: string,
  testId: string
): Promise<TestStats> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  const testOid = toObjectId(testId);

  const [statsResult] = await TestAttemptModel.aggregate([
    { $match: { testId: testOid } },
    {
      $facet: {
        total: [{ $count: "count" }],
        completed: [
          { $match: { status: { $in: ["submitted", "auto_submitted", "graded"] } } },
          { $count: "count" },
        ],
        scores: [
          { $match: { result: { $ne: null } } },
          {
            $group: {
              _id: null,
              avg: { $avg: "$result.percentage" },
              highest: { $max: "$result.percentage" },
              lowest: { $min: "$result.percentage" },
              allScores: { $push: "$result.percentage" },
              passCount: {
                $sum: { $cond: ["$result.isPassing", 1, 0] },
              },
              totalGraded: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const totalAttempts = statsResult.total[0]?.count ?? 0;
  const completedCount = statsResult.completed[0]?.count ?? 0;
  const scoreData = statsResult.scores[0];

  let medianScore = 0;
  if (scoreData?.allScores?.length) {
    const sorted = [...scoreData.allScores].sort((a: number, b: number) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianScore =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
  }

  return {
    totalAttempts,
    completedCount,
    averageScore: Math.round((scoreData?.avg ?? 0) * 100) / 100,
    medianScore: Math.round(medianScore * 100) / 100,
    highestScore: scoreData?.highest ?? 0,
    lowestScore: scoreData?.lowest ?? 0,
    passRate:
      scoreData?.totalGraded > 0
        ? Math.round((scoreData.passCount / scoreData.totalGraded) * 10000) / 100
        : 0,
  };
}

// ─── Get Live Test Status ───────────────────────────────────────────────────

interface LiveTestStatus {
  connectedCount: number;
  startedCount: number;
  submittedCount: number;
  inProgressCount: number;
}

export async function getLiveTestStatus(
  companyId: string,
  testId: string
): Promise<LiveTestStatus> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  const testOid = toObjectId(testId);

  const [statusResult] = await TestAttemptModel.aggregate([
    { $match: { testId: testOid } },
    {
      $facet: {
        started: [{ $count: "count" }],
        submitted: [
          { $match: { status: { $in: ["submitted", "auto_submitted", "graded"] } } },
          { $count: "count" },
        ],
        inProgress: [
          { $match: { status: "in_progress" } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    connectedCount: await getConnectedCount(testId),
    startedCount: statusResult.started[0]?.count ?? 0,
    submittedCount: statusResult.submitted[0]?.count ?? 0,
    inProgressCount: statusResult.inProgress[0]?.count ?? 0,
  };
}

// ─── Extend Test Time ───────────────────────────────────────────────────────

export async function extendTestTime(
  companyId: string,
  testId: string,
  additionalMinutes: number,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (doc.status !== "live") {
    throw Object.assign(
      new Error("Can only extend time for a live test"),
      { status: 400 }
    );
  }

  doc.scheduling.duration += additionalMinutes;
  doc.updatedBy = userEmail;
  await doc.save();
  return doc;
}

// ─── Pause Test ─────────────────────────────────────────────────────────────

export async function pauseTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (doc.mode !== "classroom") {
    throw Object.assign(
      new Error("Pause is only available for classroom mode tests"),
      { status: 400 }
    );
  }

  doc.updatedBy = userEmail;
  await doc.save();

  emitTestEvent(testId, "test:paused", { testId });

  return doc;
}

// ─── Resume Test ────────────────────────────────────────────────────────────

export async function resumeTest(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<OnlineTestDocument> {
  const doc = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  doc.updatedBy = userEmail;
  await doc.save();

  emitTestEvent(testId, "test:resumed", { testId });

  return doc;
}
