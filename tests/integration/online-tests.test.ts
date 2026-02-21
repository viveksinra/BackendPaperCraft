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
const mockCreateTest = vi.fn();
const mockListTests = vi.fn();
const mockGetTestById = vi.fn();
const mockUpdateTest = vi.fn();
const mockDeleteTest = vi.fn();
const mockDuplicateTest = vi.fn();
const mockScheduleTest = vi.fn();
const mockGoLive = vi.fn();
const mockCompleteTest = vi.fn();
const mockArchiveTest = vi.fn();
const mockPublishResults = vi.fn();
const mockExtendTestTime = vi.fn();
const mockPauseTest = vi.fn();
const mockResumeTest = vi.fn();
const mockGetTestStats = vi.fn();
const mockGetLiveTestStatus = vi.fn();

vi.mock("../../src/services/onlineTestService", () => ({
  createTest: (...args: unknown[]) => mockCreateTest(...args),
  listTests: (...args: unknown[]) => mockListTests(...args),
  getTestById: (...args: unknown[]) => mockGetTestById(...args),
  updateTest: (...args: unknown[]) => mockUpdateTest(...args),
  deleteTest: (...args: unknown[]) => mockDeleteTest(...args),
  duplicateTest: (...args: unknown[]) => mockDuplicateTest(...args),
  scheduleTest: (...args: unknown[]) => mockScheduleTest(...args),
  goLive: (...args: unknown[]) => mockGoLive(...args),
  completeTest: (...args: unknown[]) => mockCompleteTest(...args),
  archiveTest: (...args: unknown[]) => mockArchiveTest(...args),
  publishResults: (...args: unknown[]) => mockPublishResults(...args),
  extendTestTime: (...args: unknown[]) => mockExtendTestTime(...args),
  pauseTest: (...args: unknown[]) => mockPauseTest(...args),
  resumeTest: (...args: unknown[]) => mockResumeTest(...args),
  getTestStats: (...args: unknown[]) => mockGetTestStats(...args),
  getLiveTestStatus: (...args: unknown[]) => mockGetLiveTestStatus(...args),
}));

// Mock testAttemptService
const mockListAttempts = vi.fn();

vi.mock("../../src/services/testAttemptService", () => ({
  listAttempts: (...args: unknown[]) => mockListAttempts(...args),
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
const mockExportResultsCsv = vi.fn();

vi.mock("../../src/services/resultComputationService", () => ({
  exportResultsCsv: (...args: unknown[]) => mockExportResultsCsv(...args),
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
const BASE = `/api/v2/companies/${COMPANY_ID}/online-tests`;

let app: ReturnType<typeof buildApp>;

describe("Online Tests API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /online-tests ──────────────────────────────────────────────────

  describe("POST /online-tests", () => {
    const sectionPayload = {
      name: "Section A",
      questionIds: [new mongoose.Types.ObjectId().toString()],
      timeLimit: 30,
      instructions: "Answer all questions",
      canGoBack: true,
    };

    it("creates test for live_mock mode", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(),
        title: "Live Mock Test",
        mode: "live_mock",
        status: "draft",
        sections: [sectionPayload],
      };
      mockCreateTest.mockResolvedValue(test);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Live Mock Test",
          mode: "live_mock",
          sections: [sectionPayload],
          scheduling: {
            startTime: new Date(Date.now() + 86400000).toISOString(),
            duration: 60,
          },
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.mode).toBe("live_mock");
      expect(mockCreateTest).toHaveBeenCalledWith(
        COMPANY_ID,
        "testTenant",
        expect.objectContaining({ mode: "live_mock" }),
        "teacher@test.com"
      );
    });

    it("creates test for anytime_mock mode", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(),
        title: "Anytime Mock",
        mode: "anytime_mock",
        status: "draft",
      };
      mockCreateTest.mockResolvedValue(test);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Anytime Mock",
          mode: "anytime_mock",
          sections: [sectionPayload],
          scheduling: {
            availableFrom: new Date(Date.now() + 86400000).toISOString(),
            endTime: new Date(Date.now() + 172800000).toISOString(),
          },
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.mode).toBe("anytime_mock");
    });

    it("creates test for practice mode", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(),
        title: "Practice Test",
        mode: "practice",
        status: "draft",
      };
      mockCreateTest.mockResolvedValue(test);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Practice Test",
          mode: "practice",
          sections: [sectionPayload],
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.mode).toBe("practice");
    });

    it("creates test for classroom mode", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(),
        title: "Classroom Test",
        mode: "classroom",
        status: "draft",
      };
      mockCreateTest.mockResolvedValue(test);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Classroom Test",
          mode: "classroom",
          sections: [sectionPayload],
          assignment: { classIds: [], studentIds: [], isPublic: false },
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.mode).toBe("classroom");
    });

    it("creates test for section_timed mode", async () => {
      const test = {
        _id: new mongoose.Types.ObjectId(),
        title: "Section Timed Test",
        mode: "section_timed",
        status: "draft",
      };
      mockCreateTest.mockResolvedValue(test);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Section Timed Test",
          mode: "section_timed",
          sections: [{ ...sectionPayload, timeLimit: 20, canGoBack: false }],
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.mode).toBe("section_timed");
    });

    it("rejects invalid mode configuration (400)", async () => {
      mockCreateTest.mockRejectedValue(
        Object.assign(new Error("One or more questions not found or archived"), {
          status: 400,
        })
      );

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Bad Test",
          mode: "live_mock",
          sections: [sectionPayload],
        })
        .expect(400);

      expect(res.body.message).toContain("not found or archived");
    });
  });

  // ─── GET /online-tests ───────────────────────────────────────────────────

  describe("GET /online-tests", () => {
    it("lists tests with pagination", async () => {
      const items = [
        { _id: new mongoose.Types.ObjectId(), title: "Test 1", status: "draft" },
        { _id: new mongoose.Types.ObjectId(), title: "Test 2", status: "live" },
      ];
      mockListTests.mockResolvedValue({ items, total: 2 });

      const res = await request(app)
        .get(`${BASE}?page=1&limit=10`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.items).toHaveLength(2);
      expect(res.body.myData.total).toBe(2);
      expect(mockListTests).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.any(Object),
        expect.objectContaining({ page: 1, limit: 10 })
      );
    });
  });

  // ─── GET /online-tests/:id ──────────────────────────────────────────────

  describe("GET /online-tests/:id", () => {
    it("returns test detail", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = {
        _id: testId,
        title: "Math Exam",
        mode: "live_mock",
        status: "draft",
        totalMarks: 100,
        totalQuestions: 20,
      };
      mockGetTestById.mockResolvedValue(test);

      const res = await request(app)
        .get(`${BASE}/${testId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.title).toBe("Math Exam");
      expect(res.body.myData.test.totalMarks).toBe(100);
      expect(mockGetTestById).toHaveBeenCalledWith(COMPANY_ID, testId);
    });
  });

  // ─── PATCH /online-tests/:id ────────────────────────────────────────────

  describe("PATCH /online-tests/:id", () => {
    it("updates test", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = { _id: testId, title: "Updated Title", status: "draft" };
      mockUpdateTest.mockResolvedValue(test);

      const res = await request(app)
        .patch(`${BASE}/${testId}`)
        .send({ title: "Updated Title" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.title).toBe("Updated Title");
      expect(mockUpdateTest).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        expect.objectContaining({ title: "Updated Title" }),
        "teacher@test.com"
      );
    });
  });

  // ─── DELETE /online-tests/:id ───────────────────────────────────────────

  describe("DELETE /online-tests/:id", () => {
    it("deletes draft test", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      mockDeleteTest.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${BASE}/${testId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteTest).toHaveBeenCalledWith(COMPANY_ID, testId);
    });
  });

  // ─── POST /online-tests/:id/duplicate ───────────────────────────────────

  describe("POST /online-tests/:id/duplicate", () => {
    it("creates copy", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const copy = {
        _id: new mongoose.Types.ObjectId(),
        title: "Math Exam (Copy)",
        status: "draft",
      };
      mockDuplicateTest.mockResolvedValue(copy);

      const res = await request(app)
        .post(`${BASE}/${testId}/duplicate`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.title).toBe("Math Exam (Copy)");
      expect(mockDuplicateTest).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        "teacher@test.com"
      );
    });
  });

  // ─── POST /online-tests/:id/schedule ────────────────────────────────────

  describe("POST /online-tests/:id/schedule", () => {
    it("schedules test", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = { _id: testId, status: "scheduled" };
      mockScheduleTest.mockResolvedValue(test);

      const res = await request(app)
        .post(`${BASE}/${testId}/schedule`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.status).toBe("scheduled");
      expect(mockScheduleTest).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        "teacher@test.com"
      );
    });
  });

  // ─── POST /online-tests/:id/go-live ─────────────────────────────────────

  describe("POST /online-tests/:id/go-live", () => {
    it("sets live", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = { _id: testId, status: "live" };
      mockGoLive.mockResolvedValue(test);

      const res = await request(app)
        .post(`${BASE}/${testId}/go-live`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.status).toBe("live");
      expect(mockGoLive).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        "teacher@test.com"
      );
    });
  });

  // ─── POST /online-tests/:id/complete ────────────────────────────────────

  describe("POST /online-tests/:id/complete", () => {
    it("completes test", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = { _id: testId, status: "completed" };
      mockCompleteTest.mockResolvedValue(test);

      const res = await request(app)
        .post(`${BASE}/${testId}/complete`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.status).toBe("completed");
      expect(mockCompleteTest).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        "teacher@test.com"
      );
    });
  });

  // ─── POST /online-tests/:id/publish-results ────────────────────────────

  describe("POST /online-tests/:id/publish-results", () => {
    it("publishes results", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = { _id: testId, resultsPublished: true };
      mockPublishResults.mockResolvedValue(test);

      const res = await request(app)
        .post(`${BASE}/${testId}/publish-results`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.resultsPublished).toBe(true);
    });
  });

  // ─── POST /online-tests/:id/extend-time ────────────────────────────────

  describe("POST /online-tests/:id/extend-time", () => {
    it("extends time", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const test = {
        _id: testId,
        status: "live",
        scheduling: { duration: 90 },
      };
      mockExtendTestTime.mockResolvedValue(test);

      const res = await request(app)
        .post(`${BASE}/${testId}/extend-time`)
        .send({ additionalMinutes: 30 })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.test.scheduling.duration).toBe(90);
      expect(mockExtendTestTime).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        30,
        "teacher@test.com"
      );
    });
  });

  // ─── GET /online-tests/:id/stats ────────────────────────────────────────

  describe("GET /online-tests/:id/stats", () => {
    it("returns statistics", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const stats = {
        totalAttempts: 30,
        completedCount: 25,
        averageScore: 72.5,
        medianScore: 74,
        highestScore: 98,
        lowestScore: 32,
        passRate: 80,
      };
      mockGetTestStats.mockResolvedValue(stats);

      const res = await request(app)
        .get(`${BASE}/${testId}/stats`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.stats.totalAttempts).toBe(30);
      expect(res.body.myData.stats.averageScore).toBe(72.5);
      expect(res.body.myData.stats.passRate).toBe(80);
    });
  });

  // ─── GET /online-tests/:id/attempts ─────────────────────────────────────

  describe("GET /online-tests/:id/attempts", () => {
    it("lists attempts", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const items = [
        {
          _id: new mongoose.Types.ObjectId(),
          studentId: new mongoose.Types.ObjectId(),
          status: "submitted",
          attemptNumber: 1,
        },
      ];
      mockListAttempts.mockResolvedValue({ items, total: 1 });

      const res = await request(app)
        .get(`${BASE}/${testId}/attempts?page=1&limit=20`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.items).toHaveLength(1);
      expect(res.body.myData.total).toBe(1);
      expect(mockListAttempts).toHaveBeenCalledWith(
        COMPANY_ID,
        testId,
        expect.any(Object),
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });
  });

  // ─── GET /online-tests/:id/export-results ──────────────────────────────

  describe("GET /online-tests/:id/export-results", () => {
    it("returns CSV", async () => {
      const testId = new mongoose.Types.ObjectId().toString();
      const csv =
        "Rank,Name,Email,Total Score,Percentage,Grade,Time Taken (min)\n1,Alice,alice@test.com,90/100,90,A+,55";
      mockExportResultsCsv.mockResolvedValue(csv);

      const res = await request(app)
        .get(`${BASE}/${testId}/export-results`)
        .expect(200);

      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.text).toContain("Rank,Name,Email");
      expect(res.text).toContain("Alice");
      expect(mockExportResultsCsv).toHaveBeenCalledWith(COMPANY_ID, testId);
    });
  });
});
