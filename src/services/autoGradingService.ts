import mongoose from "mongoose";
import { TestAttemptDocument, AttemptAnswer } from "../models/testAttempt";
import { QuestionModel } from "../models/question";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Question type sets ─────────────────────────────────────────────────────

const SUBJECTIVE_TYPES = new Set([
  "short_answer",
  "long_answer",
  "creative_writing",
  "essay",
]);

// ─── Grade Attempt ──────────────────────────────────────────────────────────

export async function gradeAttempt(
  attempt: TestAttemptDocument,
  questions: any[]
): Promise<AttemptAnswer[]> {
  const questionMap = new Map<string, any>();
  for (const q of questions) {
    questionMap.set(q._id.toString(), q);
  }

  for (const answer of attempt.answers) {
    const question = questionMap.get(answer.questionId.toString());
    if (!question) {
      // Question not found — skip grading this answer
      answer.isCorrect = null;
      answer.marksAwarded = null;
      continue;
    }

    const result = gradeByType(question.type, answer.answer, question);

    if (result === null) {
      // Subjective — needs manual grading
      answer.isCorrect = null;
      answer.marksAwarded = null;
    } else {
      answer.isCorrect = result.isCorrect;
      answer.marksAwarded = result.marksAwarded;
    }
  }

  return attempt.answers;
}

// ─── Grade Single Question for Feedback ─────────────────────────────────────

export async function gradeQuestionForFeedback(
  questionType: string,
  studentAnswer: unknown,
  question: any
): Promise<{
  isCorrect: boolean | null;
  marksAwarded: number | null;
  correctAnswer: unknown;
  solution: string;
  explanation: string;
}> {
  const content = question.content ?? {};
  const metadata = question.metadata ?? {};
  const maxMarks = metadata.marks ?? 1;

  if (SUBJECTIVE_TYPES.has(questionType)) {
    return {
      isCorrect: null,
      marksAwarded: null,
      correctAnswer: null,
      solution: content.solution ?? "",
      explanation: content.explanation ?? "",
    };
  }

  const result = gradeByType(questionType, studentAnswer, question);

  return {
    isCorrect: result ? result.isCorrect : null,
    marksAwarded: result ? result.marksAwarded : null,
    correctAnswer: extractCorrectAnswer(questionType, question),
    solution: content.solution ?? "",
    explanation: content.explanation ?? "",
  };
}

// ─── Internal Grading Logic ─────────────────────────────────────────────────

interface GradeResult {
  isCorrect: boolean;
  marksAwarded: number;
}

function gradeByType(
  questionType: string,
  studentAnswer: unknown,
  question: any
): GradeResult | null {
  const content = question.content ?? {};
  const metadata = question.metadata ?? {};
  const maxMarks: number = metadata.marks ?? 1;

  if (SUBJECTIVE_TYPES.has(questionType)) {
    return null;
  }

  if (studentAnswer === null || studentAnswer === undefined) {
    return { isCorrect: false, marksAwarded: 0 };
  }

  switch (questionType) {
    case "mcq_single":
      return gradeMcqSingle(studentAnswer, content, maxMarks);

    case "mcq_multiple":
      return gradeMcqMultiple(studentAnswer, content, maxMarks);

    case "true_false":
      return gradeTrueFalse(studentAnswer, content, maxMarks);

    case "fill_in_blank":
      return gradeFillInBlank(studentAnswer, content, maxMarks);

    case "numerical":
      return gradeNumerical(studentAnswer, content, maxMarks);

    case "match_the_column":
      return gradeMatchTheColumn(studentAnswer, content, maxMarks);

    default:
      // Unknown type — cannot auto-grade
      return null;
  }
}

function gradeMcqSingle(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const correctIndex = content.correctOptionIndex;
  const isCorrect = studentAnswer === correctIndex;
  return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
}

function gradeMcqMultiple(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const correctIndices = (content.correctOptionIndices as number[]) ?? [];
  const studentIndices = Array.isArray(studentAnswer)
    ? (studentAnswer as number[])
    : [];

  const correctSet = new Set(correctIndices);
  const studentSet = new Set(studentIndices);

  if (correctSet.size !== studentSet.size) {
    return { isCorrect: false, marksAwarded: 0 };
  }

  for (const idx of correctSet) {
    if (!studentSet.has(idx)) {
      return { isCorrect: false, marksAwarded: 0 };
    }
  }

  return { isCorrect: true, marksAwarded: maxMarks };
}

function gradeTrueFalse(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const correctValue = content.correctAnswer;
  const isCorrect = Boolean(studentAnswer) === Boolean(correctValue);
  return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
}

function gradeFillInBlank(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const acceptedAnswers = content.acceptedAnswers as string[] | undefined;
  const correctAnswer = content.correctAnswer as string | undefined;

  const studentStr = String(studentAnswer).trim().toLowerCase();

  if (acceptedAnswers && Array.isArray(acceptedAnswers)) {
    const isCorrect = acceptedAnswers.some(
      (a) => String(a).trim().toLowerCase() === studentStr
    );
    return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
  }

  const isCorrect =
    correctAnswer !== undefined &&
    String(correctAnswer).trim().toLowerCase() === studentStr;
  return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
}

function gradeNumerical(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const correctValue = Number(content.correctAnswer);
  const studentValue = Number(studentAnswer);

  if (isNaN(studentValue) || isNaN(correctValue)) {
    return { isCorrect: false, marksAwarded: 0 };
  }

  const tolerance = Number(content.tolerance ?? 0);
  const isCorrect = Math.abs(studentValue - correctValue) <= tolerance;
  return { isCorrect, marksAwarded: isCorrect ? maxMarks : 0 };
}

function gradeMatchTheColumn(
  studentAnswer: unknown,
  content: Record<string, unknown>,
  maxMarks: number
): GradeResult {
  const correctPairs = content.correctPairs as Record<string, string> | undefined;
  const studentPairs = studentAnswer as Record<string, string> | undefined;

  if (!correctPairs || !studentPairs) {
    return { isCorrect: false, marksAwarded: 0 };
  }

  const totalPairs = Object.keys(correctPairs).length;
  if (totalPairs === 0) {
    return { isCorrect: false, marksAwarded: 0 };
  }

  let correctCount = 0;
  for (const [key, value] of Object.entries(correctPairs)) {
    if (studentPairs[key] === value) {
      correctCount++;
    }
  }

  const isCorrect = correctCount === totalPairs;
  // Partial marks: proportional to correct pairs
  const marksAwarded =
    Math.round((correctCount / totalPairs) * maxMarks * 100) / 100;

  return { isCorrect, marksAwarded };
}

// ─── Extract Correct Answer ─────────────────────────────────────────────────

function extractCorrectAnswer(
  questionType: string,
  question: any
): unknown {
  const content = question.content ?? {};

  switch (questionType) {
    case "mcq_single":
      return content.correctOptionIndex;
    case "mcq_multiple":
      return content.correctOptionIndices;
    case "true_false":
      return content.correctAnswer;
    case "fill_in_blank":
      return content.acceptedAnswers ?? content.correctAnswer;
    case "numerical":
      return content.correctAnswer;
    case "match_the_column":
      return content.correctPairs;
    default:
      return null;
  }
}
