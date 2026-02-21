import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Mock the question model
vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: vi.fn(),
  },
}));

// Mock the testAttempt model
vi.mock("../../../src/models/testAttempt", () => ({
  TestAttemptModel: {},
}));

import {
  gradeAttempt,
  gradeQuestionForFeedback,
} from "../../../src/services/autoGradingService";

const validObjectId = "507f1f77bcf86cd799439011";

function makeQuestion(
  type: string,
  content: Record<string, unknown>,
  marks = 1
) {
  return {
    _id: new mongoose.Types.ObjectId(),
    type,
    content,
    metadata: { marks },
  };
}

function makeAnswer(
  questionId: mongoose.Types.ObjectId,
  answer: unknown,
  maxMarks = 1,
  sectionIndex = 0
) {
  return {
    questionId,
    sectionIndex,
    answer,
    isCorrect: null as boolean | null,
    marksAwarded: null as number | null,
    maxMarks,
    timeSpent: 10,
    flagged: false,
    answeredAt: new Date(),
    feedback: "",
  };
}

function makeAttempt(answers: ReturnType<typeof makeAnswer>[]) {
  return { answers } as any;
}

describe("autoGradingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── gradeMcqSingle ──────────────────────────────────────────────────────

  describe("gradeMcqSingle", () => {
    it("awards full marks for correct answer", async () => {
      const q = makeQuestion("mcq_single", { correctOptionIndex: 2 }, 4);
      const ans = makeAnswer(q._id, 2, 4);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(4);
    });

    it("awards 0 marks for incorrect answer", async () => {
      const q = makeQuestion("mcq_single", { correctOptionIndex: 2 }, 4);
      const ans = makeAnswer(q._id, 3, 4);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });

    it("awards 0 marks for null answer", async () => {
      const q = makeQuestion("mcq_single", { correctOptionIndex: 0 }, 2);
      const ans = makeAnswer(q._id, null, 2);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── gradeMcqMultiple ────────────────────────────────────────────────────

  describe("gradeMcqMultiple", () => {
    it("awards full marks for exact match of all correct indices", async () => {
      const q = makeQuestion(
        "mcq_multiple",
        { correctOptionIndices: [0, 2, 3] },
        6
      );
      const ans = makeAnswer(q._id, [0, 2, 3], 6);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(6);
    });

    it("awards 0 marks for partial match (subset of correct)", async () => {
      const q = makeQuestion(
        "mcq_multiple",
        { correctOptionIndices: [0, 2, 3] },
        6
      );
      const ans = makeAnswer(q._id, [0, 2], 6);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });

    it("awards 0 marks when all answers are wrong", async () => {
      const q = makeQuestion(
        "mcq_multiple",
        { correctOptionIndices: [0, 2] },
        4
      );
      const ans = makeAnswer(q._id, [1, 3], 4);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });

    it("awards 0 marks for empty answer array", async () => {
      const q = makeQuestion(
        "mcq_multiple",
        { correctOptionIndices: [0, 1] },
        4
      );
      const ans = makeAnswer(q._id, [], 4);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── gradeTrueFalse ──────────────────────────────────────────────────────

  describe("gradeTrueFalse", () => {
    it("awards full marks for correct true answer", async () => {
      const q = makeQuestion("true_false", { correctAnswer: true }, 2);
      const ans = makeAnswer(q._id, true, 2);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(2);
    });

    it("awards 0 marks for incorrect answer", async () => {
      const q = makeQuestion("true_false", { correctAnswer: true }, 2);
      const ans = makeAnswer(q._id, false, 2);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── gradeFillInBlank ────────────────────────────────────────────────────

  describe("gradeFillInBlank", () => {
    it("is case insensitive", async () => {
      const q = makeQuestion(
        "fill_in_blank",
        { correctAnswer: "Photosynthesis" },
        3
      );
      const ans = makeAnswer(q._id, "photosynthesis", 3);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(3);
    });

    it("accepts any of multiple acceptable answers", async () => {
      const q = makeQuestion(
        "fill_in_blank",
        { acceptedAnswers: ["colour", "color"] },
        2
      );
      const ans = makeAnswer(q._id, "color", 2);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(2);
    });

    it("trims whitespace from student answer", async () => {
      const q = makeQuestion(
        "fill_in_blank",
        { correctAnswer: "gravity" },
        1
      );
      const ans = makeAnswer(q._id, "  gravity  ", 1);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(1);
    });

    it("returns incorrect for wrong fill-in-blank answer", async () => {
      const q = makeQuestion(
        "fill_in_blank",
        { correctAnswer: "gravity" },
        1
      );
      const ans = makeAnswer(q._id, "magnetism", 1);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── gradeNumerical ──────────────────────────────────────────────────────

  describe("gradeNumerical", () => {
    it("awards full marks for exact match", async () => {
      const q = makeQuestion(
        "numerical",
        { correctAnswer: 42, tolerance: 0 },
        5
      );
      const ans = makeAnswer(q._id, 42, 5);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(5);
    });

    it("awards full marks when within tolerance", async () => {
      const q = makeQuestion(
        "numerical",
        { correctAnswer: 3.14, tolerance: 0.01 },
        3
      );
      const ans = makeAnswer(q._id, 3.15, 3);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(3);
    });

    it("awards 0 marks when outside tolerance", async () => {
      const q = makeQuestion(
        "numerical",
        { correctAnswer: 3.14, tolerance: 0.01 },
        3
      );
      const ans = makeAnswer(q._id, 3.2, 3);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── gradeMatchTheColumn ─────────────────────────────────────────────────

  describe("gradeMatchTheColumn", () => {
    it("awards full marks when all pairs are correct", async () => {
      const q = makeQuestion(
        "match_the_column",
        { correctPairs: { A: "1", B: "2", C: "3" } },
        6
      );
      const ans = makeAnswer(q._id, { A: "1", B: "2", C: "3" }, 6);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(6);
    });

    it("awards proportional marks for partial matches", async () => {
      const q = makeQuestion(
        "match_the_column",
        { correctPairs: { A: "1", B: "2", C: "3" } },
        6
      );
      const ans = makeAnswer(q._id, { A: "1", B: "3", C: "2" }, 6);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      // 1 out of 3 correct = 6 * (1/3) = 2
      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(2);
    });

    it("awards 0 marks when no pairs match", async () => {
      const q = makeQuestion(
        "match_the_column",
        { correctPairs: { A: "1", B: "2" } },
        4
      );
      const ans = makeAnswer(q._id, { A: "2", B: "1" }, 4);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBe(false);
      expect(attempt.answers[0].marksAwarded).toBe(0);
    });
  });

  // ─── Subjective types ────────────────────────────────────────────────────

  describe("subjective types", () => {
    it("returns null for short_answer type", async () => {
      const q = makeQuestion("short_answer", {}, 5);
      const ans = makeAnswer(q._id, "Some answer", 5);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBeNull();
      expect(attempt.answers[0].marksAwarded).toBeNull();
    });

    it("returns null for long_answer type", async () => {
      const q = makeQuestion("long_answer", {}, 10);
      const ans = makeAnswer(q._id, "A longer answer text", 10);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBeNull();
      expect(attempt.answers[0].marksAwarded).toBeNull();
    });

    it("returns null for essay type", async () => {
      const q = makeQuestion("essay", {}, 20);
      const ans = makeAnswer(q._id, "Essay content here", 20);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBeNull();
      expect(attempt.answers[0].marksAwarded).toBeNull();
    });

    it("returns null for creative_writing type", async () => {
      const q = makeQuestion("creative_writing", {}, 15);
      const ans = makeAnswer(q._id, "Creative piece", 15);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, [q]);

      expect(attempt.answers[0].isCorrect).toBeNull();
      expect(attempt.answers[0].marksAwarded).toBeNull();
    });
  });

  // ─── gradeQuestionForFeedback ────────────────────────────────────────────

  describe("gradeQuestionForFeedback", () => {
    it("returns correct answer and solution for MCQ", async () => {
      const q = makeQuestion("mcq_single", {
        correctOptionIndex: 1,
        solution: "Because B is correct",
        explanation: "Option B matches the formula",
      }, 2);

      const result = await gradeQuestionForFeedback("mcq_single", 1, q);

      expect(result.isCorrect).toBe(true);
      expect(result.marksAwarded).toBe(2);
      expect(result.correctAnswer).toBe(1);
      expect(result.solution).toBe("Because B is correct");
      expect(result.explanation).toBe("Option B matches the formula");
    });

    it("returns null marks for subjective question feedback", async () => {
      const q = makeQuestion("short_answer", {
        solution: "Model answer here",
        explanation: "Key points to cover",
      }, 5);

      const result = await gradeQuestionForFeedback(
        "short_answer",
        "Student answer",
        q
      );

      expect(result.isCorrect).toBeNull();
      expect(result.marksAwarded).toBeNull();
      expect(result.correctAnswer).toBeNull();
      expect(result.solution).toBe("Model answer here");
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("sets null when question is not found in map", async () => {
      const unknownQId = new mongoose.Types.ObjectId();
      const ans = makeAnswer(unknownQId, "answer", 5);
      const attempt = makeAttempt([ans]);

      await gradeAttempt(attempt, []); // empty question list

      expect(attempt.answers[0].isCorrect).toBeNull();
      expect(attempt.answers[0].marksAwarded).toBeNull();
    });

    it("grades multiple answers in a single attempt", async () => {
      const q1 = makeQuestion("mcq_single", { correctOptionIndex: 0 }, 2);
      const q2 = makeQuestion("true_false", { correctAnswer: false }, 1);
      const q3 = makeQuestion("short_answer", {}, 5);

      const ans1 = makeAnswer(q1._id, 0, 2);
      const ans2 = makeAnswer(q2._id, true, 1);
      const ans3 = makeAnswer(q3._id, "text", 5);

      const attempt = makeAttempt([ans1, ans2, ans3]);

      await gradeAttempt(attempt, [q1, q2, q3]);

      // MCQ correct
      expect(attempt.answers[0].isCorrect).toBe(true);
      expect(attempt.answers[0].marksAwarded).toBe(2);
      // True/false incorrect (answered true, correct is false)
      expect(attempt.answers[1].isCorrect).toBe(false);
      expect(attempt.answers[1].marksAwarded).toBe(0);
      // Subjective - null
      expect(attempt.answers[2].isCorrect).toBeNull();
      expect(attempt.answers[2].marksAwarded).toBeNull();
    });
  });
});
