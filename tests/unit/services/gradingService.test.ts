import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mock fns ────────────────────────────────────────────────────────────────

const mockTestAttemptFind = vi.fn();
const mockTestAttemptFindOne = vi.fn();

const mockOnlineTestFindOne = vi.fn();

const mockQuestionFind = vi.fn();

const mockComputeAttemptResult = vi.fn();
const mockComputeRanksAndPercentiles = vi.fn();
const mockUpdateQuestionPerformance = vi.fn();

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("../../../src/models/testAttempt", () => ({
  TestAttemptModel: {
    find: (...args: unknown[]) => {
      mockTestAttemptFind(...args);
      const result = mockTestAttemptFind.mock.results[mockTestAttemptFind.mock.results.length - 1]?.value;
      return {
        populate: () => ({
          lean: () => result,
        }),
        lean: () => result,
        // Handle non-chained calls (finalizeGrading doesn't use .lean())
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      };
    },
    findOne: (...args: unknown[]) => mockTestAttemptFindOne(...args),
  },
}));

vi.mock("../../../src/models/onlineTest", () => ({
  OnlineTestModel: {
    findOne: (...args: unknown[]) => {
      mockOnlineTestFindOne(...args);
      const result = mockOnlineTestFindOne.mock.results[mockOnlineTestFindOne.mock.results.length - 1]?.value;
      return {
        lean: () => result,
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      };
    },
  },
}));

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: (...args: unknown[]) => {
      mockQuestionFind(...args);
      const result = mockQuestionFind.mock.results[mockQuestionFind.mock.results.length - 1]?.value;
      return {
        lean: () => result,
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      };
    },
  },
}));

vi.mock("../../../src/services/resultComputationService", () => ({
  computeAttemptResult: (...args: unknown[]) => mockComputeAttemptResult(...args),
  computeRanksAndPercentiles: (...args: unknown[]) => mockComputeRanksAndPercentiles(...args),
  updateQuestionPerformance: (...args: unknown[]) => mockUpdateQuestionPerformance(...args),
}));

import {
  gradeAnswer,
  bulkGradeQuestion,
  finalizeGrading,
} from "../../../src/services/gradingService";

const validObjectId = "507f1f77bcf86cd799439011";
const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TEST_ID = new mongoose.Types.ObjectId().toString();
const ATTEMPT_ID = new mongoose.Types.ObjectId().toString();
const QUESTION_ID = new mongoose.Types.ObjectId().toString();
const USER_EMAIL = "teacher@test.com";

function makeAttemptDoc(
  answers: Array<{
    questionId: mongoose.Types.ObjectId;
    marksAwarded: number | null;
    maxMarks: number;
    isCorrect: boolean | null;
    timeSpent?: number;
    feedback?: string;
  }>,
  status = "submitted"
) {
  const doc: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(ATTEMPT_ID),
    companyId: new mongoose.Types.ObjectId(COMPANY_ID),
    testId: new mongoose.Types.ObjectId(TEST_ID),
    status,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      sectionIndex: 0,
      answer: "student answer",
      isCorrect: a.isCorrect,
      marksAwarded: a.marksAwarded,
      maxMarks: a.maxMarks,
      timeSpent: a.timeSpent ?? 30,
      flagged: false,
      answeredAt: new Date(),
      feedback: a.feedback ?? "",
    })),
    result: null,
    gradedBy: null,
    gradedAt: null,
    save: vi.fn().mockResolvedValue(undefined),
  };
  return doc;
}

describe("gradingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── gradeAnswer ─────────────────────────────────────────────────────────

  describe("gradeAnswer", () => {
    it("validates marks <= maxMarks and updates the answer", async () => {
      const qId = new mongoose.Types.ObjectId(QUESTION_ID);
      const attempt = makeAttemptDoc([
        { questionId: qId, marksAwarded: null, maxMarks: 10, isCorrect: null },
      ]);
      mockTestAttemptFindOne.mockResolvedValue(attempt);

      const result = await gradeAnswer(
        COMPANY_ID,
        TEST_ID,
        ATTEMPT_ID,
        QUESTION_ID,
        7,
        "Good effort",
        USER_EMAIL
      );

      expect(result.marksAwarded).toBe(7);
      expect(result.isCorrect).toBe(true);
      expect(result.feedback).toBe("Good effort");
      expect(attempt.save).toHaveBeenCalled();
    });

    it("rejects marks exceeding maxMarks", async () => {
      const qId = new mongoose.Types.ObjectId(QUESTION_ID);
      const attempt = makeAttemptDoc([
        { questionId: qId, marksAwarded: null, maxMarks: 5, isCorrect: null },
      ]);
      mockTestAttemptFindOne.mockResolvedValue(attempt);

      await expect(
        gradeAnswer(
          COMPANY_ID,
          TEST_ID,
          ATTEMPT_ID,
          QUESTION_ID,
          8,
          "",
          USER_EMAIL
        )
      ).rejects.toThrow("cannot exceed maximum marks");
    });

    it("throws 404 when attempt not found", async () => {
      mockTestAttemptFindOne.mockResolvedValue(null);

      await expect(
        gradeAnswer(
          COMPANY_ID,
          TEST_ID,
          ATTEMPT_ID,
          QUESTION_ID,
          5,
          "",
          USER_EMAIL
        )
      ).rejects.toThrow("Attempt not found");
    });
  });

  // ─── bulkGradeQuestion ───────────────────────────────────────────────────

  describe("bulkGradeQuestion", () => {
    it("grades multiple attempts for a single question", async () => {
      const qId = new mongoose.Types.ObjectId(QUESTION_ID);
      const attemptId1 = new mongoose.Types.ObjectId();
      const attemptId2 = new mongoose.Types.ObjectId();

      const attempt1 = makeAttemptDoc([
        { questionId: qId, marksAwarded: null, maxMarks: 10, isCorrect: null },
      ]);
      attempt1._id = attemptId1;

      const attempt2 = makeAttemptDoc([
        { questionId: qId, marksAwarded: null, maxMarks: 10, isCorrect: null },
      ]);
      attempt2._id = attemptId2;

      mockTestAttemptFindOne
        .mockResolvedValueOnce(attempt1)
        .mockResolvedValueOnce(attempt2);

      const result = await bulkGradeQuestion(
        COMPANY_ID,
        TEST_ID,
        QUESTION_ID,
        [
          { attemptId: attemptId1.toString(), marks: 8, feedback: "Great" },
          { attemptId: attemptId2.toString(), marks: 6 },
        ],
        USER_EMAIL
      );

      expect(result.gradedCount).toBe(2);
    });
  });

  // ─── finalizeGrading ────────────────────────────────────────────────────

  describe("finalizeGrading", () => {
    it("rejects if ungraded subjective answers remain", async () => {
      const qId = new mongoose.Types.ObjectId();
      const test = {
        _id: new mongoose.Types.ObjectId(TEST_ID),
        companyId: new mongoose.Types.ObjectId(COMPANY_ID),
        sections: [{ questionIds: [qId] }],
      };
      mockOnlineTestFindOne.mockResolvedValue(test);

      const attempt = makeAttemptDoc([
        { questionId: qId, marksAwarded: null, maxMarks: 10, isCorrect: null },
      ]);
      mockTestAttemptFind.mockResolvedValue([attempt]);

      const questions = [
        { _id: qId, type: "short_answer", metadata: {} },
      ];
      mockQuestionFind.mockResolvedValue(questions);

      await expect(
        finalizeGrading(COMPANY_ID, TEST_ID, USER_EMAIL)
      ).rejects.toThrow("ungraded subjective answers");
    });

    it("recomputes results and sets graded status", async () => {
      const qId = new mongoose.Types.ObjectId();
      const test = {
        _id: new mongoose.Types.ObjectId(TEST_ID),
        companyId: new mongoose.Types.ObjectId(COMPANY_ID),
        sections: [{ questionIds: [qId] }],
      };
      mockOnlineTestFindOne.mockResolvedValue(test);

      const attempt = makeAttemptDoc([
        { questionId: qId, marksAwarded: 8, maxMarks: 10, isCorrect: true, timeSpent: 45 },
      ]);
      mockTestAttemptFind.mockResolvedValue([attempt]);

      const questions = [
        { _id: qId, type: "mcq_single", metadata: {} },
      ];
      mockQuestionFind.mockResolvedValue(questions);

      const mockResult = {
        totalMarks: 10,
        marksObtained: 8,
        percentage: 80,
        grade: "A",
        rank: null,
        percentile: null,
        sectionScores: [],
        subjectScores: [],
        objectiveMarks: 8,
        subjectiveMarks: 0,
        isPassing: true,
      };
      mockComputeAttemptResult.mockResolvedValue(mockResult);
      mockComputeRanksAndPercentiles.mockResolvedValue({ rankedCount: 1 });
      mockUpdateQuestionPerformance.mockResolvedValue(undefined);

      const result = await finalizeGrading(COMPANY_ID, TEST_ID, USER_EMAIL);

      expect(result.gradedCount).toBe(1);
      expect(attempt.status).toBe("graded");
      expect(attempt.result).toBe(mockResult);
      expect(attempt.save).toHaveBeenCalled();
      expect(mockComputeAttemptResult).toHaveBeenCalled();
      expect(mockComputeRanksAndPercentiles).toHaveBeenCalledWith(TEST_ID);
    });

    it("throws 404 when no submitted attempts found", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(TEST_ID),
        companyId: new mongoose.Types.ObjectId(COMPANY_ID),
        sections: [],
      };
      mockOnlineTestFindOne.mockResolvedValue(test);
      mockTestAttemptFind.mockResolvedValue([]);

      await expect(
        finalizeGrading(COMPANY_ID, TEST_ID, USER_EMAIL)
      ).rejects.toThrow("No submitted attempts found");
    });
  });
});
