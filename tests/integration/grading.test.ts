import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "teacher@test.com" };
    req.tenantId = "testTenant";
    next();
  },
}));

// Mock onlineTestService
vi.mock("../../src/services/onlineTestService", () => ({
  createTest: vi.fn(),
  listTests: vi.fn(),
  getTestById: vi.fn(),
  updateTest: vi.fn(),
  deleteTest: vi.fn(),
  duplicateTest: vi.fn(),
  scheduleTest: vi.fn(),
  goLive: vi.fn(),
  completeTest: vi.fn(),
  archiveTest: vi.fn(),
  publishResults: vi.fn(),
  extendTestTime: vi.fn(),
  pauseTest: vi.fn(),
  resumeTest: vi.fn(),
  getTestStats: vi.fn(),
  getLiveTestStatus: vi.fn(),
}));

// Mock testAttemptService
vi.mock("../../src/services/testAttemptService", () => ({
  listAttempts: vi.fn(),
  startAttempt: vi.fn(),
  getAttemptState: vi.fn(),
  submitAnswer: vi.fn(),
  flagQuestion: vi.fn(),
  submitTest: vi.fn(),
  autoSubmit: vi.fn(),
  getResult: vi.fn(),
  startSection: vi.fn(),
  getSectionStatus: vi.fn(),
}));

// Mock gradingService
const mockGetUngradedAnswers = vi.fn();
const mockGradeAnswer = vi.fn();
const mockBulkGradeQuestion = vi.fn();
const mockFinalizeGrading = vi.fn();

vi.mock("../../src/services/gradingService", () => ({
  getUngradedAnswers: (...args: unknown[]) => mockGetUngradedAnswers(...args),
  gradeAnswer: (...args: unknown[]) => mockGradeAnswer(...args),
  bulkGradeQuestion: (...args: unknown[]) => mockBulkGradeQuestion(...args),
  finalizeGrading: (...args: unknown[]) => mockFinalizeGrading(...args),
}));

// Mock resultComputationService
vi.mock("../../src/services/resultComputationService", () => ({
  exportResultsCsv: vi.fn(),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/onlineTestValidation", () => ({
  createOnlineTestSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  updateOnlineTestSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

vi.mock("../../src/shared/validation/testTakingValidation", () => ({
  gradeAnswerSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  bulkGradeSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  extendTimeSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  submitAnswerSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  flagQuestionSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TEST_ID = new mongoose.Types.ObjectId().toString();
const ATTEMPT_ID = new mongoose.Types.ObjectId().toString();
const QUESTION_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/online-tests`;

let app: ReturnType<typeof buildApp>;

describe("Grading API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /online-tests/:id/grading ──────────────────────────────────────

  describe("GET /online-tests/:id/grading", () => {
    it("returns ungraded answers", async () => {
      const ungradedAnswers = [
        {
          question: {
            _id: QUESTION_ID,
            type: "long_answer",
            content: { questionText: "Explain photosynthesis" },
          },
          studentAnswers: [
            {
              studentId: "student1",
              answer: "Photosynthesis is the process by which plants...",
              attemptId: ATTEMPT_ID,
            },
            {
              studentId: "student2",
              answer: "Plants use sunlight to create food...",
              attemptId: new mongoose.Types.ObjectId().toString(),
            },
          ],
        },
      ];
      mockGetUngradedAnswers.mockResolvedValue(ungradedAnswers);

      const res = await request(app)
        .get(`${BASE}/${TEST_ID}/grading`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.ungradedAnswers).toHaveLength(1);
      expect(res.body.myData.ungradedAnswers[0].studentAnswers).toHaveLength(2);
      expect(res.body.myData.ungradedAnswers[0].question.type).toBe(
        "long_answer"
      );
      expect(mockGetUngradedAnswers).toHaveBeenCalledWith(
        COMPANY_ID,
        TEST_ID
      );
    });
  });

  // ─── POST /online-tests/:id/grade (single) ─────────────────────────────

  describe("POST /online-tests/:id/grade", () => {
    it("grades single answer", async () => {
      const gradeResult = {
        attemptId: ATTEMPT_ID,
        questionId: QUESTION_ID,
        marksAwarded: 8,
        isCorrect: true,
        feedback: "Good explanation",
        maxMarks: 10,
      };
      mockGradeAnswer.mockResolvedValue(gradeResult);

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/grade`)
        .send({
          attemptId: ATTEMPT_ID,
          questionId: QUESTION_ID,
          marks: 8,
          feedback: "Good explanation",
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.answer.marksAwarded).toBe(8);
      expect(res.body.myData.answer.feedback).toBe("Good explanation");
      expect(mockGradeAnswer).toHaveBeenCalledWith(
        COMPANY_ID,
        TEST_ID,
        ATTEMPT_ID,
        QUESTION_ID,
        8,
        "Good explanation",
        "teacher@test.com"
      );
    });

    it("bulk grades", async () => {
      const attempt2Id = new mongoose.Types.ObjectId().toString();
      mockBulkGradeQuestion.mockResolvedValue({ gradedCount: 2 });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/grade`)
        .send({
          questionId: QUESTION_ID,
          grades: [
            { attemptId: ATTEMPT_ID, marks: 7, feedback: "Good" },
            { attemptId: attempt2Id, marks: 9, feedback: "Excellent" },
          ],
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.gradedCount).toBe(2);
      expect(mockBulkGradeQuestion).toHaveBeenCalledWith(
        COMPANY_ID,
        TEST_ID,
        QUESTION_ID,
        [
          { attemptId: ATTEMPT_ID, marks: 7, feedback: "Good" },
          { attemptId: attempt2Id, marks: 9, feedback: "Excellent" },
        ],
        "teacher@test.com"
      );
    });

    it("rejects marks exceeding maxMarks", async () => {
      mockGradeAnswer.mockRejectedValue(
        Object.assign(
          new Error(
            "Marks (15) cannot exceed maximum marks (10) for this question"
          ),
          { status: 400 }
        )
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/grade`)
        .send({
          attemptId: ATTEMPT_ID,
          questionId: QUESTION_ID,
          marks: 15,
          feedback: "",
        })
        .expect(400);

      expect(res.body.message).toContain("cannot exceed maximum marks");
    });

    it("rejects negative marks", async () => {
      mockGradeAnswer.mockRejectedValue(
        Object.assign(new Error("Marks cannot be negative"), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/grade`)
        .send({
          attemptId: ATTEMPT_ID,
          questionId: QUESTION_ID,
          marks: -3,
          feedback: "",
        })
        .expect(400);

      expect(res.body.message).toContain("cannot be negative");
    });
  });

  // ─── POST /online-tests/:id/finalize-grading ───────────────────────────

  describe("POST /online-tests/:id/finalize-grading", () => {
    it("recomputes results", async () => {
      mockFinalizeGrading.mockResolvedValue({ gradedCount: 5 });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/finalize-grading`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.gradedCount).toBe(5);
      expect(mockFinalizeGrading).toHaveBeenCalledWith(
        COMPANY_ID,
        TEST_ID,
        "teacher@test.com"
      );
    });

    it("rejects incomplete grading", async () => {
      mockFinalizeGrading.mockRejectedValue(
        Object.assign(
          new Error(
            "Attempt abc123 has ungraded subjective answers. Grade all answers before finalizing."
          ),
          { status: 400 }
        )
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/finalize-grading`)
        .expect(400);

      expect(res.body.message).toContain("ungraded subjective answers");
      expect(res.body.message).toContain("Grade all answers before finalizing");
    });
  });
});
