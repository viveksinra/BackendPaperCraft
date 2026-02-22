import mongoose from "mongoose";
import { TestAttemptModel, TestAttemptDocument } from "../models/testAttempt";
import { OnlineTestModel } from "../models/onlineTest";
import { QuestionModel } from "../models/question";
import * as resultComputationService from "./resultComputationService";
import { addAnalyticsRecomputeJob } from "../queue/queues";
import { logger } from "../shared/logger";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Subjective question types ──────────────────────────────────────────────

const SUBJECTIVE_TYPES = new Set([
  "short_answer",
  "long_answer",
  "creative_writing",
  "essay",
]);

// ─── Get Ungraded Answers ───────────────────────────────────────────────────

export async function getUngradedAnswers(
  companyId: string,
  testId: string,
  filters?: { sectionIndex?: number; questionId?: string }
): Promise<
  Array<{
    question: any;
    studentAnswers: Array<{
      studentId: string;
      answer: unknown;
      attemptId: string;
    }>;
  }>
> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);

  // Find all submitted/auto_submitted attempts for this test
  const attempts = await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    status: { $in: ["submitted", "auto_submitted"] },
  })
    .populate("studentId", "displayName")
    .lean();

  // Load all subjective questions for this test
  const test = await OnlineTestModel.findOne({
    _id: testOid,
    companyId: companyOid,
  }).lean();

  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Collect all question IDs across sections
  const allQuestionIds = test.sections.flatMap((s: any) => s.questionIds);

  // Load question details
  const questions = await QuestionModel.find({
    _id: { $in: allQuestionIds },
  }).lean();

  // Filter to subjective types only
  let subjectiveQuestions = questions.filter((q) =>
    SUBJECTIVE_TYPES.has(q.type)
  );

  // Apply optional filters
  if (filters?.questionId) {
    const filterQid = filters.questionId;
    subjectiveQuestions = subjectiveQuestions.filter(
      (q) => q._id.toString() === filterQid
    );
  }

  // Group ungraded answers by question
  const result: Array<{
    question: any;
    studentAnswers: Array<{
      studentId: string;
      answer: unknown;
      attemptId: string;
    }>;
  }> = [];

  for (const question of subjectiveQuestions) {
    const qId = question._id.toString();
    const studentAnswers: Array<{
      studentId: string;
      answer: unknown;
      attemptId: string;
    }> = [];

    for (const attempt of attempts as any[]) {
      for (const ans of attempt.answers) {
        if (ans.questionId.toString() !== qId) continue;
        if (ans.marksAwarded !== null) continue; // already graded

        // Apply section filter if provided
        if (
          filters?.sectionIndex !== undefined &&
          ans.sectionIndex !== filters.sectionIndex
        ) {
          continue;
        }

        studentAnswers.push({
          studentId: attempt.studentId?._id?.toString() ?? attempt.studentId?.toString(),
          answer: ans.answer,
          attemptId: (attempt._id as mongoose.Types.ObjectId).toString(),
        });
      }
    }

    if (studentAnswers.length > 0) {
      result.push({ question, studentAnswers });
    }
  }

  return result;
}

// ─── Grade Single Answer ────────────────────────────────────────────────────

export async function gradeAnswer(
  companyId: string,
  testId: string,
  attemptId: string,
  questionId: string,
  marks: number,
  feedback: string,
  userEmail: string
): Promise<any> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);
  const attemptOid = toObjectId(attemptId);
  const questionOid = toObjectId(questionId);

  const attempt = await TestAttemptModel.findOne({
    _id: attemptOid,
    companyId: companyOid,
    testId: testOid,
  });

  if (!attempt) {
    throw Object.assign(new Error("Attempt not found"), { status: 404 });
  }

  // Find the answer entry
  const answerEntry = attempt.answers.find(
    (a) => a.questionId.toString() === questionId
  );

  if (!answerEntry) {
    throw Object.assign(
      new Error("Answer not found for this question in the attempt"),
      { status: 404 }
    );
  }

  // Validate marks do not exceed maxMarks
  if (marks > answerEntry.maxMarks) {
    throw Object.assign(
      new Error(
        `Marks (${marks}) cannot exceed maximum marks (${answerEntry.maxMarks}) for this question`
      ),
      { status: 400 }
    );
  }

  if (marks < 0) {
    throw Object.assign(
      new Error("Marks cannot be negative"),
      { status: 400 }
    );
  }

  // Update the answer entry
  answerEntry.marksAwarded = marks;
  answerEntry.isCorrect = marks > 0;
  answerEntry.feedback = feedback || "";

  await attempt.save();

  return {
    attemptId: (attempt._id as mongoose.Types.ObjectId).toString(),
    questionId,
    marksAwarded: answerEntry.marksAwarded,
    isCorrect: answerEntry.isCorrect,
    feedback: answerEntry.feedback,
    maxMarks: answerEntry.maxMarks,
  };
}

// ─── Bulk Grade Question ────────────────────────────────────────────────────

export async function bulkGradeQuestion(
  companyId: string,
  testId: string,
  questionId: string,
  grades: Array<{ attemptId: string; marks: number; feedback?: string }>,
  userEmail: string
): Promise<{ gradedCount: number }> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);

  let gradedCount = 0;

  for (const entry of grades) {
    const attemptOid = toObjectId(entry.attemptId);

    const attempt = await TestAttemptModel.findOne({
      _id: attemptOid,
      companyId: companyOid,
      testId: testOid,
    });

    if (!attempt) continue;

    const answerEntry = attempt.answers.find(
      (a) => a.questionId.toString() === questionId
    );

    if (!answerEntry) continue;

    // Validate marks
    if (entry.marks < 0 || entry.marks > answerEntry.maxMarks) continue;

    answerEntry.marksAwarded = entry.marks;
    answerEntry.isCorrect = entry.marks > 0;
    answerEntry.feedback = entry.feedback ?? "";

    await attempt.save();
    gradedCount++;
  }

  return { gradedCount };
}

// ─── Finalize Grading ───────────────────────────────────────────────────────

export async function finalizeGrading(
  companyId: string,
  testId: string,
  userEmail: string
): Promise<{ gradedCount: number }> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);

  const test = await OnlineTestModel.findOne({
    _id: testOid,
    companyId: companyOid,
  });

  if (!test) {
    throw Object.assign(new Error("Test not found"), { status: 404 });
  }

  // Load all submitted attempts
  const attempts = await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    status: { $in: ["submitted", "auto_submitted"] },
  });

  if (!attempts.length) {
    throw Object.assign(
      new Error("No submitted attempts found for this test"),
      { status: 404 }
    );
  }

  // Collect all question IDs across all sections
  const allQuestionIds = test.sections.flatMap((s) => s.questionIds);
  const questions = await QuestionModel.find({
    _id: { $in: allQuestionIds },
  }).lean();

  const questionMap = new Map<string, any>();
  for (const q of questions) {
    questionMap.set(q._id.toString(), q);
  }

  // Validate all subjective answers are graded
  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      const question = questionMap.get(ans.questionId.toString());
      if (!question) continue;

      if (SUBJECTIVE_TYPES.has(question.type) && ans.marksAwarded === null) {
        throw Object.assign(
          new Error(
            `Attempt ${attempt._id} has ungraded subjective answers. Grade all answers before finalizing.`
          ),
          { status: 400 }
        );
      }
    }
  }

  // Recompute full results for all attempts
  const now = new Date();

  for (const attempt of attempts) {
    const result = await resultComputationService.computeAttemptResult(
      attempt,
      test,
      questions
    );

    attempt.result = result;
    attempt.status = "graded";
    attempt.gradedBy = userEmail;
    attempt.gradedAt = now;

    await attempt.save();
  }

  // Compute ranks and percentiles
  await resultComputationService.computeRanksAndPercentiles(testId);

  // Update question performance stats
  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      if (ans.isCorrect !== null) {
        await resultComputationService.updateQuestionPerformance(
          ans.questionId.toString(),
          ans.isCorrect,
          ans.timeSpent
        );
      }
    }
  }

  // Fire-and-forget: queue analytics recompute for each graded student (Phase 7)
  for (const attempt of attempts) {
    try {
      await addAnalyticsRecomputeJob({
        companyId: companyId,
        studentUserId: attempt.studentId.toString(),
        testId: testId,
      });
    } catch (err) {
      logger.warn({
        msg: "Failed to queue analytics recompute after grading finalization",
        studentUserId: attempt.studentId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { gradedCount: attempts.length };
}
