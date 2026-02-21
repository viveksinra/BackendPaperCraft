import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Mock models
const mockTestAttemptFind = vi.fn();
const mockTestAttemptBulkWrite = vi.fn();

vi.mock("../../../src/models/testAttempt", () => ({
  TestAttemptModel: {
    find: (...args: unknown[]) => {
      mockTestAttemptFind(...args);
      return {
        select: () => ({
          lean: () => mockTestAttemptFind.mock.results[mockTestAttemptFind.mock.results.length - 1]?.value,
        }),
      };
    },
    bulkWrite: (...args: unknown[]) => mockTestAttemptBulkWrite(...args),
  },
}));

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    updateOne: vi.fn(),
  },
}));

vi.mock("../../../src/models/onlineTest", () => ({
  OnlineTestModel: {},
}));

import {
  computeAttemptResult,
  computeRanksAndPercentiles,
  calculateGrade,
  updateQuestionPerformance,
} from "../../../src/services/resultComputationService";

const validObjectId = "507f1f77bcf86cd799439011";

function makeTestDoc(sections: { name: string }[], passingScore = 40) {
  return {
    sections: sections.map((s, i) => ({ name: s.name, questionIds: [] })),
    options: { passingScore },
  } as any;
}

function makeAttemptAnswer(
  questionId: mongoose.Types.ObjectId,
  sectionIndex: number,
  marksAwarded: number | null,
  maxMarks: number
) {
  return {
    questionId,
    sectionIndex,
    answer: "some answer",
    isCorrect: marksAwarded !== null ? marksAwarded > 0 : null,
    marksAwarded,
    maxMarks,
    timeSpent: 30,
    flagged: false,
    answeredAt: new Date(),
    feedback: "",
  };
}

describe("resultComputationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── calculateGrade ──────────────────────────────────────────────────────

  describe("calculateGrade", () => {
    it("returns A+ for 100%", () => {
      expect(calculateGrade(100)).toBe("A+");
    });

    it("returns A+ for 90%", () => {
      expect(calculateGrade(90)).toBe("A+");
    });

    it("returns A for 89%", () => {
      expect(calculateGrade(89)).toBe("A");
    });

    it("returns A for 80%", () => {
      expect(calculateGrade(80)).toBe("A");
    });

    it("returns B for 79%", () => {
      expect(calculateGrade(79)).toBe("B");
    });

    it("returns B for 70%", () => {
      expect(calculateGrade(70)).toBe("B");
    });

    it("returns C for 69%", () => {
      expect(calculateGrade(69)).toBe("C");
    });

    it("returns C for 60%", () => {
      expect(calculateGrade(60)).toBe("C");
    });

    it("returns D for 59%", () => {
      expect(calculateGrade(59)).toBe("D");
    });

    it("returns D for 50%", () => {
      expect(calculateGrade(50)).toBe("D");
    });

    it("returns F for 49%", () => {
      expect(calculateGrade(49)).toBe("F");
    });

    it("returns F for 0%", () => {
      expect(calculateGrade(0)).toBe("F");
    });
  });

  // ─── computeAttemptResult ────────────────────────────────────────────────

  describe("computeAttemptResult", () => {
    it("sums marks per section and calculates section percentages", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const q2 = new mongoose.Types.ObjectId();

      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = {
        answers: [
          makeAttemptAnswer(q1, 0, 3, 5),
          makeAttemptAnswer(q2, 0, 4, 5),
        ],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "Math" } },
        { _id: q2, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "Math" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.sectionScores).toHaveLength(1);
      expect(result.sectionScores[0].marksObtained).toBe(7);
      expect(result.sectionScores[0].totalMarks).toBe(10);
      expect(result.sectionScores[0].percentage).toBe(70);
    });

    it("groups scores by subject", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const q2 = new mongoose.Types.ObjectId();

      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = {
        answers: [
          makeAttemptAnswer(q1, 0, 8, 10),
          makeAttemptAnswer(q2, 0, 6, 10),
        ],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "math1", subjectName: "Math" } },
        { _id: q2, type: "mcq_single", metadata: { subjectId: "eng1", subjectName: "English" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.subjectScores).toHaveLength(2);
      const mathScore = result.subjectScores.find(
        (s) => s.subjectName === "Math"
      );
      const engScore = result.subjectScores.find(
        (s) => s.subjectName === "English"
      );
      expect(mathScore!.marksObtained).toBe(8);
      expect(engScore!.marksObtained).toBe(6);
    });

    it("splits objective and subjective marks", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const q2 = new mongoose.Types.ObjectId();

      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = {
        answers: [
          makeAttemptAnswer(q1, 0, 5, 5),
          makeAttemptAnswer(q2, 0, 3, 10),
        ],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "S" } },
        { _id: q2, type: "short_answer", metadata: { subjectId: "s1", subjectName: "S" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.objectiveMarks).toBe(5);
      expect(result.subjectiveMarks).toBe(3);
    });

    it("calculates overall percentage and grade correctly", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = {
        answers: [makeAttemptAnswer(q1, 0, 9, 10)],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "S" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.marksObtained).toBe(9);
      expect(result.totalMarks).toBe(10);
      expect(result.percentage).toBe(90);
      expect(result.grade).toBe("A+");
      expect(result.isPassing).toBe(true);
    });

    it("marks as failing when below passing score", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const test = makeTestDoc([{ name: "Section A" }], 50);
      const attempt = {
        answers: [makeAttemptAnswer(q1, 0, 3, 10)],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "S" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.percentage).toBe(30);
      expect(result.isPassing).toBe(false);
    });

    it("handles empty answers array", async () => {
      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = { answers: [] } as any;

      const result = await computeAttemptResult(attempt, test, []);

      expect(result.totalMarks).toBe(0);
      expect(result.marksObtained).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.grade).toBe("F");
    });

    it("defaults rank and percentile to null", async () => {
      const q1 = new mongoose.Types.ObjectId();
      const test = makeTestDoc([{ name: "Section A" }]);
      const attempt = {
        answers: [makeAttemptAnswer(q1, 0, 5, 10)],
      } as any;

      const questions = [
        { _id: q1, type: "mcq_single", metadata: { subjectId: "s1", subjectName: "S" } },
      ];

      const result = await computeAttemptResult(attempt, test, questions);

      expect(result.rank).toBeNull();
      expect(result.percentile).toBeNull();
    });
  });

  // ─── computeRanksAndPercentiles ──────────────────────────────────────────

  describe("computeRanksAndPercentiles", () => {
    it("returns rankedCount 0 when no graded attempts exist", async () => {
      mockTestAttemptFind.mockResolvedValue([]);

      const result = await computeRanksAndPercentiles(validObjectId);

      expect(result.rankedCount).toBe(0);
    });
  });
});
