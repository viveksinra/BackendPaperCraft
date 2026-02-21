import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "student@test.com", studentId: "student123" };
    req.tenantId = "testTenant";
    next();
  },
}));

// Mock testAttemptService
const mockStartAttempt = vi.fn();
const mockGetAttemptState = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockFlagQuestion = vi.fn();
const mockSubmitTest = vi.fn();
const mockAutoSubmit = vi.fn();
const mockGetResult = vi.fn();
const mockStartSection = vi.fn();
const mockGetSectionStatus = vi.fn();
const mockListAttempts = vi.fn();

vi.mock("../../src/services/testAttemptService", () => ({
  startAttempt: (...args: unknown[]) => mockStartAttempt(...args),
  getAttemptState: (...args: unknown[]) => mockGetAttemptState(...args),
  submitAnswer: (...args: unknown[]) => mockSubmitAnswer(...args),
  flagQuestion: (...args: unknown[]) => mockFlagQuestion(...args),
  submitTest: (...args: unknown[]) => mockSubmitTest(...args),
  autoSubmit: (...args: unknown[]) => mockAutoSubmit(...args),
  getResult: (...args: unknown[]) => mockGetResult(...args),
  startSection: (...args: unknown[]) => mockStartSection(...args),
  getSectionStatus: (...args: unknown[]) => mockGetSectionStatus(...args),
  listAttempts: (...args: unknown[]) => mockListAttempts(...args),
}));

// Mock onlineTestService (needed because server.ts imports onlineTests route)
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

// Mock gradingService (needed because onlineTests route imports it)
vi.mock("../../src/services/gradingService", () => ({
  getUngradedAnswers: vi.fn(),
  gradeAnswer: vi.fn(),
  bulkGradeQuestion: vi.fn(),
  finalizeGrading: vi.fn(),
}));

// Mock resultComputationService (needed because onlineTests route imports it)
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
  submitAnswerSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  flagQuestionSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  gradeAnswerSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  bulkGradeSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  extendTimeSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

import { buildApp } from "../../src/api/server";

const TEST_ID = new mongoose.Types.ObjectId().toString();
const QUESTION_ID = new mongoose.Types.ObjectId().toString();
const ATTEMPT_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/tests`;

let app: ReturnType<typeof buildApp>;

describe("Test Taking API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /tests/:id/start ──────────────────────────────────────────────

  describe("POST /tests/:id/start", () => {
    it("starts attempt, returns questions without correct answers", async () => {
      const attemptResult = {
        attemptId: ATTEMPT_ID,
        attemptNumber: 1,
        questions: [
          {
            _id: QUESTION_ID,
            type: "mcq",
            content: {
              questionText: "What is 2+2?",
              options: ["3", "4", "5", "6"],
            },
          },
        ],
        sections: [
          {
            sectionIndex: 0,
            name: "Section A",
            questionCount: 1,
            timeLimit: 30,
            instructions: "Answer all",
            canGoBack: true,
          },
        ],
        mode: "live_mock",
        duration: 60,
        options: {
          randomizeQuestions: false,
          randomizeOptions: false,
          instantFeedback: false,
          allowReview: true,
          showResultsAfterCompletion: true,
        },
        questionOrder: [QUESTION_ID],
        optionOrders: {},
        currentSectionIndex: 0,
        startedAt: new Date().toISOString(),
      };
      mockStartAttempt.mockResolvedValue(attemptResult);

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/start`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.attemptId).toBe(ATTEMPT_ID);
      expect(res.body.myData.questions).toHaveLength(1);
      // Verify no correctAnswer leaked in the sanitized response
      const question = res.body.myData.questions[0];
      expect(question.content).not.toHaveProperty("correctAnswer");
      expect(question.content).not.toHaveProperty("solution");
      expect(mockStartAttempt).toHaveBeenCalledWith(
        TEST_ID,
        "student123",
        expect.any(String),
        "testTenant",
        expect.any(String),
        expect.any(String)
      );
    });

    it("rejects if test not live", async () => {
      mockStartAttempt.mockRejectedValue(
        Object.assign(new Error("Test is not live"), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/start`)
        .expect(400);

      expect(res.body.message).toContain("not live");
    });

    it("rejects if max attempts reached", async () => {
      mockStartAttempt.mockRejectedValue(
        Object.assign(new Error("Maximum number of attempts reached"), {
          status: 400,
        })
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/start`)
        .expect(400);

      expect(res.body.message).toContain("Maximum number of attempts");
    });
  });

  // ─── POST /tests/:id/answer ─────────────────────────────────────────────

  describe("POST /tests/:id/answer", () => {
    it("saves answer", async () => {
      mockSubmitAnswer.mockResolvedValue({ saved: true });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/answer`)
        .send({ questionId: QUESTION_ID, answer: "B" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.saved).toBe(true);
      expect(mockSubmitAnswer).toHaveBeenCalledWith(
        TEST_ID,
        "student123",
        QUESTION_ID,
        "B"
      );
    });

    it("practice mode returns instant feedback", async () => {
      mockSubmitAnswer.mockResolvedValue({
        saved: true,
        isCorrect: null,
        correctAnswer: null,
        solution: null,
      });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/answer`)
        .send({ questionId: QUESTION_ID, answer: "4" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.saved).toBe(true);
      expect(res.body.myData).toHaveProperty("isCorrect");
    });

    it("rejects answer for wrong section in section_timed mode", async () => {
      mockSubmitAnswer.mockRejectedValue(
        Object.assign(new Error("Question is not in the current section"), {
          status: 400,
        })
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/answer`)
        .send({ questionId: QUESTION_ID, answer: "C" })
        .expect(400);

      expect(res.body.message).toContain("not in the current section");
    });
  });

  // ─── POST /tests/:id/flag ──────────────────────────────────────────────

  describe("POST /tests/:id/flag", () => {
    it("flags question", async () => {
      mockFlagQuestion.mockResolvedValue({ flagged: true });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/flag`)
        .send({ questionId: QUESTION_ID, flagged: true })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockFlagQuestion).toHaveBeenCalledWith(
        TEST_ID,
        "student123",
        QUESTION_ID,
        true
      );
    });
  });

  // ─── POST /tests/:id/submit ────────────────────────────────────────────

  describe("POST /tests/:id/submit", () => {
    it("submits test", async () => {
      mockSubmitTest.mockResolvedValue({ submitted: true });

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/submit`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.submitted).toBe(true);
      expect(mockSubmitTest).toHaveBeenCalledWith(TEST_ID, "student123");
    });

    it("rejects submit when no in-progress attempt found", async () => {
      mockSubmitTest.mockRejectedValue(
        Object.assign(new Error("No in-progress attempt found"), {
          status: 404,
        })
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/submit`)
        .expect(404);

      expect(res.body.message).toContain("No in-progress attempt");
    });
  });

  // ─── GET /tests/:id/result ─────────────────────────────────────────────

  describe("GET /tests/:id/result", () => {
    it("returns result", async () => {
      const result = {
        attemptId: ATTEMPT_ID,
        attemptNumber: 1,
        status: "graded",
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        result: {
          totalMarks: 100,
          marksObtained: 85,
          percentage: 85,
          grade: "A",
          rank: 3,
          percentile: 90,
          isPassing: true,
          sectionScores: [],
          subjectScores: [],
          objectiveMarks: 60,
          subjectiveMarks: 25,
        },
        answers: [],
      };
      mockGetResult.mockResolvedValue(result);

      const res = await request(app)
        .get(`${BASE}/${TEST_ID}/result`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.result.percentage).toBe(85);
      expect(res.body.myData.result.grade).toBe("A");
      expect(res.body.myData.result.isPassing).toBe(true);
      expect(mockGetResult).toHaveBeenCalledWith(TEST_ID, "student123");
    });
  });

  // ─── POST /tests/:id/section/:idx/start ────────────────────────────────

  describe("POST /tests/:id/section/:idx/start", () => {
    it("starts next section", async () => {
      const sectionResult = {
        sectionIndex: 1,
        name: "Section B",
        questions: [
          {
            _id: new mongoose.Types.ObjectId().toString(),
            type: "mcq",
            content: { questionText: "What is 3+3?" },
          },
        ],
        timeLimit: 20,
        instructions: "Section B instructions",
        canGoBack: false,
      };
      mockStartSection.mockResolvedValue(sectionResult);

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/section/1/start`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.sectionIndex).toBe(1);
      expect(res.body.myData.name).toBe("Section B");
      expect(res.body.myData.questions).toHaveLength(1);
      expect(mockStartSection).toHaveBeenCalledWith(TEST_ID, "student123", 1);
    });

    it("rejects skip (must proceed sequentially)", async () => {
      mockStartSection.mockRejectedValue(
        Object.assign(
          new Error("Cannot skip sections. Next section must be 1"),
          { status: 400 }
        )
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/section/3/start`)
        .expect(400);

      expect(res.body.message).toContain("Cannot skip sections");
    });

    it("rejects section navigation for non-section-timed tests", async () => {
      mockStartSection.mockRejectedValue(
        Object.assign(
          new Error("Section navigation is only available in section-timed mode"),
          { status: 400 }
        )
      );

      const res = await request(app)
        .post(`${BASE}/${TEST_ID}/section/1/start`)
        .expect(400);

      expect(res.body.message).toContain("section-timed mode");
    });
  });
});
