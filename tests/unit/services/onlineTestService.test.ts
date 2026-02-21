import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mock fns ────────────────────────────────────────────────────────────────

const mockOnlineTestCreate = vi.fn();
const mockOnlineTestFindOne = vi.fn();
const mockOnlineTestFind = vi.fn();
const mockOnlineTestCountDocuments = vi.fn();
const mockOnlineTestDeleteOne = vi.fn();

const mockTestAttemptCountDocuments = vi.fn();
const mockTestAttemptUpdateMany = vi.fn();
const mockTestAttemptAggregate = vi.fn();

const mockPaperFindOne = vi.fn();

const mockQuestionFind = vi.fn();
const mockQuestionCountDocuments = vi.fn();

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("../../../src/models/onlineTest", () => ({
  OnlineTestModel: {
    create: (...args: unknown[]) => mockOnlineTestCreate(...args),
    findOne: (...args: unknown[]) => mockOnlineTestFindOne(...args),
    find: (...args: unknown[]) => {
      mockOnlineTestFind(...args);
      return {
        sort: () => ({
          skip: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      };
    },
    countDocuments: (...args: unknown[]) => mockOnlineTestCountDocuments(...args),
    deleteOne: (...args: unknown[]) => mockOnlineTestDeleteOne(...args),
  },
}));

vi.mock("../../../src/models/testAttempt", () => ({
  TestAttemptModel: {
    countDocuments: (...args: unknown[]) => mockTestAttemptCountDocuments(...args),
    updateMany: (...args: unknown[]) => mockTestAttemptUpdateMany(...args),
    aggregate: (...args: unknown[]) => mockTestAttemptAggregate(...args),
  },
}));

vi.mock("../../../src/models/paper", () => ({
  PaperModel: {
    findOne: (...args: unknown[]) => mockPaperFindOne(...args),
  },
}));

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: (...args: unknown[]) => mockQuestionFind(...args),
    countDocuments: (...args: unknown[]) => mockQuestionCountDocuments(...args),
  },
}));

import {
  createTest,
  updateTest,
  deleteTest,
  scheduleTest,
  goLive,
  completeTest,
  listTests,
  duplicateTest,
  getTestStats,
} from "../../../src/services/onlineTestService";

const validObjectId = "507f1f77bcf86cd799439011";
const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TENANT_ID = "testTenant";
const USER_EMAIL = "teacher@test.com";

function makeTestDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    companyId: new mongoose.Types.ObjectId(COMPANY_ID),
    title: "Test Exam",
    description: "",
    mode: "practice",
    status: "draft",
    sections: [
      {
        name: "Section A",
        questionIds: [new mongoose.Types.ObjectId()],
        timeLimit: 0,
        instructions: "",
        canGoBack: true,
      },
    ],
    options: {
      randomizeQuestions: false,
      randomizeOptions: false,
      showResultsAfterCompletion: true,
      showSolutionsAfterCompletion: false,
      showResultsToParents: true,
      instantFeedback: false,
      allowReview: true,
      maxAttempts: 1,
      passingScore: 40,
    },
    assignment: { classIds: [], studentIds: [], isPublic: false },
    grading: { requireManualGrading: false, gradingDeadline: null },
    scheduling: { startTime: null, endTime: null, availableFrom: null, duration: 0 },
    resultsPublished: false,
    totalMarks: 10,
    totalQuestions: 5,
    createdBy: USER_EMAIL,
    updatedBy: USER_EMAIL,
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn().mockReturnValue({
      _id: undefined,
      title: "Test Exam",
      status: "draft",
      mode: "practice",
      sections: [],
      options: {},
      assignment: {},
      grading: {},
      scheduling: { duration: 60 },
      resultsPublished: false,
      totalMarks: 10,
      totalQuestions: 5,
      createdBy: USER_EMAIL,
      updatedBy: USER_EMAIL,
    }),
    ...overrides,
  };
  return doc;
}

describe("onlineTestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createTest ──────────────────────────────────────────────────────────

  describe("createTest", () => {
    it("applies mode defaults for practice (maxAttempts=999, instantFeedback)", async () => {
      mockQuestionCountDocuments.mockResolvedValue(2);
      mockQuestionFind.mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(), metadata: { marks: 5 } },
        { _id: new mongoose.Types.ObjectId(), metadata: { marks: 5 } },
      ]);
      const createdDoc = makeTestDoc({
        mode: "practice",
        options: { maxAttempts: 999, instantFeedback: true },
      });
      mockOnlineTestCreate.mockResolvedValue(createdDoc);

      const result = await createTest(COMPANY_ID, TENANT_ID, {
        title: "Practice Quiz",
        mode: "practice",
        sections: [
          {
            name: "Section A",
            questionIds: [validObjectId, "607f1f77bcf86cd799439022"],
          },
        ],
        options: {},
      }, USER_EMAIL);

      expect(mockOnlineTestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            instantFeedback: true,
            maxAttempts: 999,
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it("calculates totalMarks and totalQuestions from sections", async () => {
      const qId1 = new mongoose.Types.ObjectId();
      const qId2 = new mongoose.Types.ObjectId();

      mockQuestionCountDocuments.mockResolvedValue(2);
      mockQuestionFind.mockResolvedValue([
        { _id: qId1, metadata: { marks: 3 } },
        { _id: qId2, metadata: { marks: 7 } },
      ]);
      mockOnlineTestCreate.mockResolvedValue(
        makeTestDoc({ totalMarks: 10, totalQuestions: 2 })
      );

      await createTest(COMPANY_ID, TENANT_ID, {
        title: "Marks Test",
        mode: "practice",
        sections: [
          {
            name: "Section A",
            questionIds: [qId1.toString(), qId2.toString()],
          },
        ],
      }, USER_EMAIL);

      expect(mockOnlineTestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          totalMarks: 10,
          totalQuestions: 2,
        })
      );
    });
  });

  // ─── updateTest ──────────────────────────────────────────────────────────

  describe("updateTest", () => {
    it("blocks updates to live tests", async () => {
      const liveTest = makeTestDoc({ status: "live" });
      mockOnlineTestFindOne.mockResolvedValue(liveTest);

      await expect(
        updateTest(
          COMPANY_ID,
          (liveTest._id as mongoose.Types.ObjectId).toString(),
          { title: "Updated" },
          USER_EMAIL
        )
      ).rejects.toThrow("Cannot update a test that is live or completed");
    });

    it("blocks updates to completed tests", async () => {
      const completedTest = makeTestDoc({ status: "completed" });
      mockOnlineTestFindOne.mockResolvedValue(completedTest);

      await expect(
        updateTest(
          COMPANY_ID,
          (completedTest._id as mongoose.Types.ObjectId).toString(),
          { title: "Updated" },
          USER_EMAIL
        )
      ).rejects.toThrow("Cannot update a test that is live or completed");
    });
  });

  // ─── deleteTest ──────────────────────────────────────────────────────────

  describe("deleteTest", () => {
    it("blocks deletion when attempts exist", async () => {
      const test = makeTestDoc({ status: "draft" });
      mockOnlineTestFindOne.mockResolvedValue(test);
      mockTestAttemptCountDocuments.mockResolvedValue(3);

      await expect(
        deleteTest(COMPANY_ID, (test._id as mongoose.Types.ObjectId).toString())
      ).rejects.toThrow(
        "Cannot delete a test with existing attempts"
      );
    });

    it("blocks deletion of live tests", async () => {
      const test = makeTestDoc({ status: "live" });
      mockOnlineTestFindOne.mockResolvedValue(test);

      await expect(
        deleteTest(COMPANY_ID, (test._id as mongoose.Types.ObjectId).toString())
      ).rejects.toThrow("Cannot delete a live test");
    });

    it("allows deletion when no attempts and not live", async () => {
      const test = makeTestDoc({ status: "draft" });
      mockOnlineTestFindOne.mockResolvedValue(test);
      mockTestAttemptCountDocuments.mockResolvedValue(0);
      mockOnlineTestDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(
        deleteTest(COMPANY_ID, (test._id as mongoose.Types.ObjectId).toString())
      ).resolves.toBeUndefined();

      expect(mockOnlineTestDeleteOne).toHaveBeenCalled();
    });
  });

  // ─── scheduleTest ────────────────────────────────────────────────────────

  describe("scheduleTest", () => {
    it("changes status to scheduled", async () => {
      const test = makeTestDoc({ status: "draft" });
      mockOnlineTestFindOne.mockResolvedValue(test);

      const result = await scheduleTest(
        COMPANY_ID,
        (test._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect(result.status).toBe("scheduled");
      expect(test.save).toHaveBeenCalled();
    });
  });

  // ─── goLive ──────────────────────────────────────────────────────────────

  describe("goLive", () => {
    it("changes status to live", async () => {
      const test = makeTestDoc({ status: "scheduled" });
      mockOnlineTestFindOne.mockResolvedValue(test);

      const result = await goLive(
        COMPANY_ID,
        (test._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect(result.status).toBe("live");
      expect(test.save).toHaveBeenCalled();
    });
  });

  // ─── completeTest ────────────────────────────────────────────────────────

  describe("completeTest", () => {
    it("auto-submits in-progress attempts", async () => {
      const test = makeTestDoc({ status: "live" });
      mockOnlineTestFindOne.mockResolvedValue(test);
      mockTestAttemptUpdateMany.mockResolvedValue({ modifiedCount: 5 });

      const result = await completeTest(
        COMPANY_ID,
        (test._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect(result.status).toBe("completed");
      expect(mockTestAttemptUpdateMany).toHaveBeenCalledWith(
        { testId: test._id, status: "in_progress" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "auto_submitted",
          }),
        })
      );
    });
  });

  // ─── listTests ───────────────────────────────────────────────────────────

  describe("listTests", () => {
    it("returns paginated results with total count", async () => {
      mockOnlineTestCountDocuments.mockResolvedValue(50);

      const result = await listTests(COMPANY_ID, {}, { page: 2, limit: 10 });

      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(mockOnlineTestFind).toHaveBeenCalled();
      expect(mockOnlineTestCountDocuments).toHaveBeenCalled();
    });
  });

  // ─── duplicateTest ───────────────────────────────────────────────────────

  describe("duplicateTest", () => {
    it("creates copy with draft status and (Copy) suffix", async () => {
      const original = makeTestDoc({ title: "Original Test" });
      mockOnlineTestFindOne.mockResolvedValue(original);

      const copiedDoc = makeTestDoc({
        title: "Original Test (Copy)",
        status: "draft",
      });
      mockOnlineTestCreate.mockResolvedValue(copiedDoc);

      const result = await duplicateTest(
        COMPANY_ID,
        (original._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect(mockOnlineTestCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Exam (Copy)",
          status: "draft",
          resultsPublished: false,
        })
      );
    });
  });

  // ─── getTestStats ────────────────────────────────────────────────────────

  describe("getTestStats", () => {
    it("returns aggregated stats for the test", async () => {
      const test = makeTestDoc();
      mockOnlineTestFindOne.mockResolvedValue(test);

      mockTestAttemptAggregate.mockResolvedValue([
        {
          total: [{ count: 20 }],
          completed: [{ count: 18 }],
          scores: [
            {
              avg: 72.5,
              highest: 98,
              lowest: 35,
              allScores: [35, 50, 60, 70, 72, 75, 80, 85, 90, 98],
              passCount: 15,
              totalGraded: 18,
            },
          ],
        },
      ]);

      const stats = await getTestStats(
        COMPANY_ID,
        (test._id as mongoose.Types.ObjectId).toString()
      );

      expect(stats.totalAttempts).toBe(20);
      expect(stats.completedCount).toBe(18);
      expect(stats.highestScore).toBe(98);
      expect(stats.lowestScore).toBe(35);
      expect(stats.averageScore).toBe(72.5);
    });

    it("throws 404 when test not found", async () => {
      mockOnlineTestFindOne.mockResolvedValue(null);

      await expect(
        getTestStats(COMPANY_ID, validObjectId)
      ).rejects.toThrow("Test not found");
    });
  });
});
