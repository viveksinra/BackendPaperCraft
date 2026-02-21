import mongoose from "mongoose";
import {
  TestAttemptModel,
  TestAttemptDocument,
  AttemptResult,
  SectionScore,
  SubjectScore,
} from "../models/testAttempt";
import { OnlineTestDocument } from "../models/onlineTest";
import { QuestionModel } from "../models/question";

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

// ─── Compute Attempt Result ─────────────────────────────────────────────────

export async function computeAttemptResult(
  attempt: TestAttemptDocument,
  test: OnlineTestDocument,
  questions: any[]
): Promise<AttemptResult> {
  const questionMap = new Map<string, any>();
  for (const q of questions) {
    questionMap.set(q._id.toString(), q);
  }

  // ── Per-section scores ──────────────────────────────────────────────────
  const sectionScores: SectionScore[] = [];

  for (let i = 0; i < test.sections.length; i++) {
    const section = test.sections[i];
    const sectionAnswers = attempt.answers.filter(
      (a) => a.sectionIndex === i
    );

    let marksObtained = 0;
    let totalMarks = 0;

    for (const ans of sectionAnswers) {
      totalMarks += ans.maxMarks;
      marksObtained += ans.marksAwarded ?? 0;
    }

    const percentage = totalMarks > 0
      ? Math.round((marksObtained / totalMarks) * 10000) / 100
      : 0;

    sectionScores.push({
      sectionIndex: i,
      sectionName: section.name,
      marksObtained,
      totalMarks,
      percentage,
    });
  }

  // ── Per-subject scores ──────────────────────────────────────────────────
  const subjectMap = new Map<
    string,
    { subjectName: string; marksObtained: number; totalMarks: number }
  >();

  for (const ans of attempt.answers) {
    const question = questionMap.get(ans.questionId.toString());
    if (!question) continue;

    const metadata = question.metadata ?? {};
    const subjectId = metadata.subjectId?.toString() ?? "unknown";
    const subjectName = (metadata.subjectName as string) ?? "Unknown";

    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subjectName,
        marksObtained: 0,
        totalMarks: 0,
      });
    }

    const entry = subjectMap.get(subjectId)!;
    entry.totalMarks += ans.maxMarks;
    entry.marksObtained += ans.marksAwarded ?? 0;
  }

  const subjectScores: SubjectScore[] = [];
  for (const [subjectId, data] of subjectMap) {
    const percentage = data.totalMarks > 0
      ? Math.round((data.marksObtained / data.totalMarks) * 10000) / 100
      : 0;

    subjectScores.push({
      subjectId,
      subjectName: data.subjectName,
      marksObtained: data.marksObtained,
      totalMarks: data.totalMarks,
      percentage,
    });
  }

  // ── Objective vs subjective split ───────────────────────────────────────
  let objectiveMarks = 0;
  let subjectiveMarks = 0;

  for (const ans of attempt.answers) {
    const question = questionMap.get(ans.questionId.toString());
    if (!question) continue;

    const awarded = ans.marksAwarded ?? 0;
    if (SUBJECTIVE_TYPES.has(question.type)) {
      subjectiveMarks += awarded;
    } else {
      objectiveMarks += awarded;
    }
  }

  // ── Overall totals ─────────────────────────────────────────────────────
  let totalMarks = 0;
  let marksObtained = 0;

  for (const ans of attempt.answers) {
    totalMarks += ans.maxMarks;
    marksObtained += ans.marksAwarded ?? 0;
  }

  const percentage = totalMarks > 0
    ? Math.round((marksObtained / totalMarks) * 10000) / 100
    : 0;

  const grade = calculateGrade(percentage);
  const passingScore = test.options?.passingScore ?? 40;
  const isPassing = percentage >= passingScore;

  return {
    totalMarks,
    marksObtained,
    percentage,
    grade,
    rank: null,
    percentile: null,
    sectionScores,
    subjectScores,
    objectiveMarks,
    subjectiveMarks,
    isPassing,
  };
}

// ─── Compute Ranks and Percentiles ──────────────────────────────────────────

export async function computeRanksAndPercentiles(
  testId: string
): Promise<{ rankedCount: number }> {
  const testOid = toObjectId(testId);

  const attempts = await TestAttemptModel.find({
    testId: testOid,
    status: "graded",
    result: { $ne: null },
  })
    .select("_id result.marksObtained")
    .lean();

  if (!attempts.length) {
    return { rankedCount: 0 };
  }

  // Sort by marksObtained descending
  attempts.sort((a: any, b: any) => {
    const aMarks = a.result?.marksObtained ?? 0;
    const bMarks = b.result?.marksObtained ?? 0;
    return bMarks - aMarks;
  });

  const N = attempts.length;
  const bulkOps: any[] = [];
  let currentRank = 1;

  for (let i = 0; i < N; i++) {
    const attempt = attempts[i] as any;
    const currentMarks = attempt.result?.marksObtained ?? 0;

    // Ties: if this attempt has the same marks as the previous, use the same rank
    if (i > 0) {
      const prevMarks = (attempts[i - 1] as any).result?.marksObtained ?? 0;
      if (currentMarks < prevMarks) {
        currentRank = i + 1;
      }
    }

    const percentile =
      Math.round(((N - currentRank) / N) * 10000) / 100;

    bulkOps.push({
      updateOne: {
        filter: { _id: attempt._id },
        update: {
          $set: {
            "result.rank": currentRank,
            "result.percentile": percentile,
          },
        },
      },
    });
  }

  if (bulkOps.length) {
    await TestAttemptModel.bulkWrite(bulkOps);
  }

  return { rankedCount: N };
}

// ─── Calculate Grade ────────────────────────────────────────────────────────

export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
}

// ─── Update Question Performance ────────────────────────────────────────────

export async function updateQuestionPerformance(
  questionId: string,
  isCorrect: boolean,
  timeSpent: number
): Promise<void> {
  const questionOid = toObjectId(questionId);

  await QuestionModel.updateOne(
    { _id: questionOid },
    {
      $inc: {
        "performance.totalAttempts": 1,
        "performance.correctAttempts": isCorrect ? 1 : 0,
        "performance.totalTimeSpent": timeSpent,
      },
      $set: {
        "performance.lastAttemptedAt": new Date(),
      },
    }
  );
}

// ─── Export Results CSV ─────────────────────────────────────────────────────

export async function exportResultsCsv(
  companyId: string,
  testId: string
): Promise<string> {
  const companyOid = toObjectId(companyId);
  const testOid = toObjectId(testId);

  const attempts = await TestAttemptModel.find({
    companyId: companyOid,
    testId: testOid,
    status: "graded",
    result: { $ne: null },
  })
    .populate("studentId", "displayName")
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "email" },
    })
    .sort({ "result.rank": 1 })
    .lean();

  if (!attempts.length) {
    throw Object.assign(
      new Error("No graded attempts found for this test"),
      { status: 404 }
    );
  }

  // CSV header
  const rows: string[] = [
    "Rank,Name,Email,Total Score,Percentage,Grade,Time Taken (min)",
  ];

  for (const attempt of attempts as any[]) {
    const result = attempt.result;
    const student = attempt.studentId;
    const name = escapeCsvField(student?.displayName ?? "Unknown");
    const email = escapeCsvField(student?.userId?.email ?? "");
    const rank = result?.rank ?? "";
    const totalScore = `${result?.marksObtained ?? 0}/${result?.totalMarks ?? 0}`;
    const percentage = result?.percentage ?? 0;
    const grade = result?.grade ?? "";

    // Calculate time taken in minutes from startedAt to submittedAt
    let timeTaken = "";
    if (attempt.startedAt && attempt.submittedAt) {
      const diffMs =
        new Date(attempt.submittedAt).getTime() -
        new Date(attempt.startedAt).getTime();
      timeTaken = String(Math.round(diffMs / 60000));
    }

    rows.push(
      `${rank},${name},${email},${totalScore},${percentage},${grade},${timeTaken}`
    );
  }

  return rows.join("\n");
}

// ─── Utility ────────────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
