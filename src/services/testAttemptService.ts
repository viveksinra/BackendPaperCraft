import mongoose from "mongoose";
import { TestAttemptModel, TestAttemptDocument, AttemptAnswer } from "../models/testAttempt";
import { OnlineTestModel, OnlineTestDocument } from "../models/onlineTest";
import { QuestionModel } from "../models/question";
import { ClassModel } from "../models/class";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the original.
 */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Strip sensitive answer/grading fields from a question document before
 * returning it to a student.
 */
function sanitizeQuestion(q: Record<string, unknown>): Record<string, unknown> {
  const obj = typeof q.toObject === "function" ? (q as any).toObject() : { ...q };
  if (obj.content) {
    const { correctAnswer, solution, ...safeContent } = obj.content as Record<string, unknown>;
    obj.content = safeContent;
  }
  return obj;
}

/**
 * Strip sensitive fields from an AttemptAnswer before returning to a student.
 */
function sanitizeAnswer(a: Record<string, unknown>): Record<string, unknown> {
  const { isCorrect, marksAwarded, feedback, ...safe } = a;
  return safe;
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ListFilters {
  status?: string;
  studentId?: string;
  search?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

// ─── 1. Start Attempt ────────────────────────────────────────────────────────

export async function startAttempt(
  testId: string,
  studentId: string,
  companyId: string,
  tenantId: string,
  ipAddress: string,
  userAgent: string
): Promise<Record<string, unknown>> {
  const test = await OnlineTestModel.findOne({
    _id: toObjectId(testId),
    companyId: toObjectId(companyId),
  });
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // ── Validate test is accessible ──────────────────────────────────────────
  const now = new Date();

  if (test.mode === "live_mock") {
    if (test.status !== "live") {
      throw Object.assign(new Error("Test is not live"), { status: 400 });
    }
    if (test.scheduling.startTime && now < test.scheduling.startTime) {
      throw Object.assign(new Error("Test has not started yet"), { status: 400 });
    }
    if (test.scheduling.endTime && now > test.scheduling.endTime) {
      throw Object.assign(new Error("Test has ended"), { status: 400 });
    }
  } else if (test.mode === "anytime_mock") {
    if (test.status !== "live" && test.status !== "scheduled") {
      throw Object.assign(new Error("Test is not available"), { status: 400 });
    }
    if (test.scheduling.availableFrom && now < test.scheduling.availableFrom) {
      throw Object.assign(new Error("Test is not available yet"), { status: 400 });
    }
  } else if (test.mode === "practice") {
    if (test.status !== "live" && test.status !== "completed") {
      throw Object.assign(new Error("Test is not available for practice"), { status: 400 });
    }
  } else if (test.mode === "section_timed" || test.mode === "classroom") {
    if (test.status !== "live") {
      throw Object.assign(new Error("Test is not live"), { status: 400 });
    }
  }

  // ── Validate student is assigned ─────────────────────────────────────────
  const studentOid = toObjectId(studentId);

  if (!test.assignment.isPublic) {
    const directlyAssigned = test.assignment.studentIds.some(
      (sid) => sid.toString() === studentId
    );

    let assignedViaClass = false;
    if (!directlyAssigned && test.assignment.classIds.length > 0) {
      const classCount = await ClassModel.countDocuments({
        _id: { $in: test.assignment.classIds },
        students: studentOid,
      });
      assignedViaClass = classCount > 0;
    }

    if (!directlyAssigned && !assignedViaClass) {
      throw Object.assign(
        new Error("Student is not assigned to this test"),
        { status: 403 }
      );
    }
  }

  // ── Validate max attempts ────────────────────────────────────────────────
  const existingAttemptCount = await TestAttemptModel.countDocuments({
    testId: toObjectId(testId),
    studentId: studentOid,
  });

  if (existingAttemptCount >= test.options.maxAttempts) {
    throw Object.assign(
      new Error("Maximum number of attempts reached"),
      { status: 400 }
    );
  }

  // ── Collect all question IDs across sections ─────────────────────────────
  const allQuestionIds: mongoose.Types.ObjectId[] = [];
  for (const section of test.sections) {
    for (const qid of section.questionIds) {
      allQuestionIds.push(qid);
    }
  }

  // ── Randomize question order if needed ───────────────────────────────────
  let questionOrder = allQuestionIds.map((id) => id);
  if (test.options.randomizeQuestions) {
    questionOrder = shuffleArray(questionOrder);
  }

  // ── Randomize option orders for MCQ questions if needed ──────────────────
  let optionOrders: Record<string, number[]> = {};
  if (test.options.randomizeOptions) {
    const questions = await QuestionModel.find({
      _id: { $in: allQuestionIds },
    });
    for (const q of questions) {
      const content = q.content as Record<string, unknown>;
      const options = content?.options as unknown[] | undefined;
      if (options && Array.isArray(options) && options.length > 0) {
        const indexes = options.map((_, i) => i);
        optionOrders[q._id!.toString()] = shuffleArray(indexes);
      }
    }
  }

  // ── Build sections progress array ────────────────────────────────────────
  const sections = test.sections.map((_, idx) => ({
    sectionIndex: idx,
    startedAt: null as Date | null,
    completedAt: null as Date | null,
    timeSpent: 0,
    isLocked: false,
  }));

  let currentSectionIndex = 0;

  // For section_timed mode: start section 0 timer
  if (test.mode === "section_timed" && sections.length > 0) {
    sections[0].startedAt = now;
  }

  // ── Create the attempt ───────────────────────────────────────────────────
  const attempt = await TestAttemptModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    testId: toObjectId(testId),
    studentId: studentOid,
    attemptNumber: existingAttemptCount + 1,
    status: "in_progress",
    startedAt: now,
    submittedAt: null,
    sections,
    answers: [],
    result: null,
    questionOrder,
    optionOrders,
    currentSectionIndex,
    autoSavedAt: null,
    ipAddress,
    userAgent,
    gradedBy: null,
    gradedAt: null,
  });

  // ── Fetch questions (sanitized) ──────────────────────────────────────────
  const questions = await QuestionModel.find({
    _id: { $in: allQuestionIds },
  });

  const questionsById = new Map(
    questions.map((q) => [q._id!.toString(), q])
  );

  const sanitizedQuestions = questionOrder.map((qid) => {
    const q = questionsById.get(qid.toString());
    if (!q) return null;
    return sanitizeQuestion(q as unknown as Record<string, unknown>);
  }).filter(Boolean);

  // ── Build section info for the response ──────────────────────────────────
  const sectionsInfo = test.sections.map((s, idx) => ({
    sectionIndex: idx,
    name: s.name,
    questionCount: s.questionIds.length,
    timeLimit: s.timeLimit,
    instructions: s.instructions,
    canGoBack: s.canGoBack,
  }));

  return {
    attemptId: attempt._id!.toString(),
    attemptNumber: attempt.attemptNumber,
    questions: sanitizedQuestions,
    sections: sectionsInfo,
    mode: test.mode,
    duration: test.scheduling.duration,
    options: {
      randomizeQuestions: test.options.randomizeQuestions,
      randomizeOptions: test.options.randomizeOptions,
      instantFeedback: test.options.instantFeedback,
      allowReview: test.options.allowReview,
      showResultsAfterCompletion: test.options.showResultsAfterCompletion,
    },
    questionOrder: questionOrder.map((id) => id.toString()),
    optionOrders,
    currentSectionIndex,
    startedAt: attempt.startedAt,
  };
}

// ─── 2. Get Attempt State ────────────────────────────────────────────────────

export async function getAttemptState(
  testId: string,
  studentId: string
): Promise<Record<string, unknown>> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  const test = await OnlineTestModel.findById(attempt.testId);
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Calculate time remaining
  const now = new Date();
  let timeRemainingSeconds: number | null = null;

  if (test.scheduling.duration > 0 && attempt.startedAt) {
    const elapsedMs = now.getTime() - attempt.startedAt.getTime();
    const totalMs = test.scheduling.duration * 60 * 1000;
    timeRemainingSeconds = Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
  }

  // Sanitize answers: strip isCorrect, marksAwarded, feedback
  const sanitizedAnswers = attempt.answers.map((a) => {
    const raw = a as unknown as Record<string, unknown>;
    const obj = typeof raw.toObject === "function"
      ? (raw.toObject as () => Record<string, unknown>)()
      : { ...raw };
    return sanitizeAnswer(obj);
  });

  const flaggedQuestions = attempt.answers
    .filter((a) => a.flagged)
    .map((a) => a.questionId.toString());

  return {
    attemptId: attempt._id!.toString(),
    status: attempt.status,
    answers: sanitizedAnswers,
    currentSectionIndex: attempt.currentSectionIndex,
    timeRemainingSeconds,
    flaggedQuestions,
    questionOrder: attempt.questionOrder.map((id) => id.toString()),
    optionOrders: attempt.optionOrders,
    sections: attempt.sections,
    startedAt: attempt.startedAt,
    autoSavedAt: attempt.autoSavedAt,
  };
}

// ─── 3. Submit Answer ────────────────────────────────────────────────────────

export async function submitAnswer(
  testId: string,
  studentId: string,
  questionId: string,
  answer: unknown
): Promise<Record<string, unknown>> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  const test = await OnlineTestModel.findById(attempt.testId);
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Validate question belongs to the test
  const questionOid = toObjectId(questionId);
  let questionSectionIndex = -1;

  for (let i = 0; i < test.sections.length; i++) {
    if (test.sections[i].questionIds.some((qid) => qid.toString() === questionId)) {
      questionSectionIndex = i;
      break;
    }
  }

  if (questionSectionIndex === -1) {
    throw Object.assign(
      new Error("Question does not belong to this test"),
      { status: 400 }
    );
  }

  // For section_timed: validate question is in the current unlocked section
  if (test.mode === "section_timed") {
    if (questionSectionIndex !== attempt.currentSectionIndex) {
      throw Object.assign(
        new Error("Question is not in the current section"),
        { status: 400 }
      );
    }
    const sectionProgress = attempt.sections[questionSectionIndex];
    if (sectionProgress && sectionProgress.isLocked) {
      throw Object.assign(
        new Error("This section is locked"),
        { status: 400 }
      );
    }
  }

  // Upsert the answer in the answers array
  const now = new Date();
  const existingIdx = attempt.answers.findIndex(
    (a) => a.questionId.toString() === questionId
  );

  // Find the question to get maxMarks
  const question = await QuestionModel.findById(questionOid);
  const maxMarks = question
    ? ((question.metadata as Record<string, number>)?.marks ?? 1)
    : 1;

  if (existingIdx >= 0) {
    attempt.answers[existingIdx].answer = answer;
    attempt.answers[existingIdx].answeredAt = now;
  } else {
    attempt.answers.push({
      questionId: questionOid,
      sectionIndex: questionSectionIndex,
      answer,
      isCorrect: null,
      marksAwarded: null,
      maxMarks,
      timeSpent: 0,
      flagged: false,
      answeredAt: now,
      feedback: "",
    } as AttemptAnswer);
  }

  attempt.autoSavedAt = now;
  await attempt.save();

  // Practice mode with instant feedback
  if (test.mode === "practice" && test.options.instantFeedback) {
    // NOTE: actual grading will be wired to shared grading utility later
    // For now, return placeholder response structure
    return {
      saved: true,
      isCorrect: null,
      correctAnswer: null,
      solution: null,
    };
  }

  return { saved: true };
}

// ─── 4. Flag Question ────────────────────────────────────────────────────────

export async function flagQuestion(
  testId: string,
  studentId: string,
  questionId: string,
  flagged: boolean
): Promise<{ flagged: boolean }> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  const existingIdx = attempt.answers.findIndex(
    (a) => a.questionId.toString() === questionId
  );

  if (existingIdx >= 0) {
    attempt.answers[existingIdx].flagged = flagged;
  } else {
    // Create a stub answer entry with flagged status
    const test = await OnlineTestModel.findById(attempt.testId);
    let sectionIndex = 0;
    if (test) {
      for (let i = 0; i < test.sections.length; i++) {
        if (test.sections[i].questionIds.some((qid) => qid.toString() === questionId)) {
          sectionIndex = i;
          break;
        }
      }
    }

    const question = await QuestionModel.findById(toObjectId(questionId));
    const maxMarks = question
      ? ((question.metadata as Record<string, number>)?.marks ?? 1)
      : 1;

    attempt.answers.push({
      questionId: toObjectId(questionId),
      sectionIndex,
      answer: null,
      isCorrect: null,
      marksAwarded: null,
      maxMarks,
      timeSpent: 0,
      flagged,
      answeredAt: null,
      feedback: "",
    } as AttemptAnswer);
  }

  await attempt.save();
  return { flagged };
}

// ─── 5. Start Section ────────────────────────────────────────────────────────

export async function startSection(
  testId: string,
  studentId: string,
  sectionIndex: number
): Promise<Record<string, unknown>> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  const test = await OnlineTestModel.findById(attempt.testId);
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (test.mode !== "section_timed") {
    throw Object.assign(
      new Error("Section navigation is only available in section-timed mode"),
      { status: 400 }
    );
  }

  // Validate sectionIndex is exactly currentSectionIndex + 1
  if (sectionIndex !== attempt.currentSectionIndex + 1) {
    throw Object.assign(
      new Error("Cannot skip sections. Next section must be " + (attempt.currentSectionIndex + 1)),
      { status: 400 }
    );
  }

  if (sectionIndex >= test.sections.length) {
    throw Object.assign(
      new Error("Invalid section index"),
      { status: 400 }
    );
  }

  const now = new Date();

  // Lock the previous section
  const prevSection = attempt.sections[attempt.currentSectionIndex];
  if (prevSection) {
    prevSection.isLocked = true;
    prevSection.completedAt = now;
    if (prevSection.startedAt) {
      prevSection.timeSpent = Math.floor(
        (now.getTime() - prevSection.startedAt.getTime()) / 1000
      );
    }
  }

  // Start the new section
  const newSection = attempt.sections[sectionIndex];
  if (newSection) {
    newSection.startedAt = now;
  }

  attempt.currentSectionIndex = sectionIndex;
  await attempt.save();

  // Return the section's questions (sanitized)
  const testSection = test.sections[sectionIndex];
  const questions = await QuestionModel.find({
    _id: { $in: testSection.questionIds },
  });

  const sanitizedQuestions = questions.map((q) =>
    sanitizeQuestion(q as unknown as Record<string, unknown>)
  );

  return {
    sectionIndex,
    name: testSection.name,
    questions: sanitizedQuestions,
    timeLimit: testSection.timeLimit,
    instructions: testSection.instructions,
    canGoBack: testSection.canGoBack,
  };
}

// ─── 6. Get Section Status ───────────────────────────────────────────────────

export async function getSectionStatus(
  testId: string,
  studentId: string,
  sectionIndex: number
): Promise<Record<string, unknown>> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  const test = await OnlineTestModel.findById(attempt.testId);
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  if (sectionIndex < 0 || sectionIndex >= test.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  const sectionProgress = attempt.sections[sectionIndex];
  const testSection = test.sections[sectionIndex];

  // Calculate time remaining for this section
  let timeRemainingSeconds: number | null = null;
  if (testSection.timeLimit > 0 && sectionProgress?.startedAt) {
    const elapsedMs = new Date().getTime() - sectionProgress.startedAt.getTime();
    const totalMs = testSection.timeLimit * 60 * 1000;
    timeRemainingSeconds = Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
  }

  // Count answered questions in this section
  const sectionQuestionIds = new Set(
    testSection.questionIds.map((id) => id.toString())
  );
  const answeredCount = attempt.answers.filter(
    (a) =>
      sectionQuestionIds.has(a.questionId.toString()) &&
      a.answer !== null
  ).length;

  return {
    sectionIndex,
    name: testSection.name,
    timeRemainingSeconds,
    totalQuestions: testSection.questionIds.length,
    questionsAnswered: answeredCount,
    isLocked: sectionProgress?.isLocked ?? false,
    startedAt: sectionProgress?.startedAt ?? null,
    completedAt: sectionProgress?.completedAt ?? null,
  };
}

// ─── 7. Submit Test ──────────────────────────────────────────────────────────

export async function submitTest(
  testId: string,
  studentId: string
): Promise<{ submitted: boolean }> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  if (!attempt) {
    throw Object.assign(
      new Error("No in-progress attempt found"),
      { status: 404 }
    );
  }

  attempt.status = "submitted";
  attempt.submittedAt = new Date();

  // Lock all sections
  for (const section of attempt.sections) {
    if (!section.isLocked) {
      section.isLocked = true;
      if (!section.completedAt) {
        section.completedAt = attempt.submittedAt;
      }
    }
  }

  await attempt.save();

  // NOTE: Auto-grading trigger will be wired later (placeholder)

  return { submitted: true };
}

// ─── 8. Auto Submit ──────────────────────────────────────────────────────────

export async function autoSubmit(
  testId: string,
  studentId: string
): Promise<{ submitted: boolean }> {
  const attempt = await TestAttemptModel.findOne({
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
    status: "in_progress",
  });

  // Idempotent: no-op if already submitted
  if (!attempt) {
    return { submitted: true };
  }

  attempt.status = "auto_submitted";
  attempt.submittedAt = new Date();

  // Lock all sections
  for (const section of attempt.sections) {
    if (!section.isLocked) {
      section.isLocked = true;
      if (!section.completedAt) {
        section.completedAt = attempt.submittedAt;
      }
    }
  }

  await attempt.save();

  return { submitted: true };
}

// ─── 9. Get Result ───────────────────────────────────────────────────────────

export async function getResult(
  testId: string,
  studentId: string,
  attemptNumber?: number
): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = {
    testId: toObjectId(testId),
    studentId: toObjectId(studentId),
  };

  if (attemptNumber !== undefined) {
    query.attemptNumber = attemptNumber;
  } else {
    // Get the latest attempt
    query.status = { $in: ["submitted", "auto_submitted", "graded"] };
  }

  const attempt = await TestAttemptModel.findOne(query).sort({ attemptNumber: -1 });

  if (!attempt) {
    throw Object.assign(
      new Error("No completed attempt found"),
      { status: 404 }
    );
  }

  if (attempt.status === "in_progress") {
    throw Object.assign(
      new Error("Attempt is still in progress"),
      { status: 400 }
    );
  }

  const test = await OnlineTestModel.findById(attempt.testId);
  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Build response
  const response: Record<string, unknown> = {
    attemptId: attempt._id!.toString(),
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
  };

  if (attempt.result) {
    response.result = attempt.result;
  }

  // Include answers with correct answers / solutions only if the flag is enabled
  if (test.options.showSolutionsAfterCompletion) {
    response.answers = attempt.answers;
  } else {
    // Return answers without correctAnswer / solution
    response.answers = attempt.answers.map((a) => {
      const raw = a as unknown as Record<string, unknown>;
      const obj = typeof raw.toObject === "function"
        ? (raw.toObject as () => Record<string, unknown>)()
        : { ...raw };
      return obj;
    });
  }

  if (attempt.status === "graded") {
    response.gradedBy = attempt.gradedBy;
    response.gradedAt = attempt.gradedAt;
  }

  return response;
}

// ─── 10. List Attempts (Teacher View) ────────────────────────────────────────

export async function listAttempts(
  companyId: string,
  testId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ items: TestAttemptDocument[]; total: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    testId: toObjectId(testId),
  };

  if (filters?.status) query.status = filters.status;
  if (filters?.studentId) query.studentId = toObjectId(filters.studentId);
  if (filters?.search) {
    // Search is not directly applicable on attempts; skip or extend later
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortBy = pagination?.sortBy ?? "createdAt";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    TestAttemptModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("studentId", "displayName grade"),
    TestAttemptModel.countDocuments(query),
  ]);

  return { items, total };
}
