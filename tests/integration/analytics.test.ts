import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import path from "path";

// Generate a real JWT using the actual auth module
const authModule = require(path.resolve(__dirname, "../../utils/auth"));
const TEACHER_TOKEN = authModule.signToken({ sub: "teacher@test.com" });

// ---- Mock models ----
const TEACHER_USER_ID = new mongoose.Types.ObjectId();

vi.mock("../../Models/User", () => {
  const id = new mongoose.Types.ObjectId();
  const mockUser = { _id: id, email: "teacher@test.com", firstName: "Teacher", lastName: "One" };
  return {
    __esModule: true,
    default: {
      findOne: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
      find: vi.fn().mockResolvedValue([mockUser]),
    },
    findOne: vi.fn().mockResolvedValue(mockUser),
    findById: vi.fn().mockResolvedValue(mockUser),
  };
});

vi.mock("../../Models/Membership", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ role: "admin", userEmail: "teacher@test.com" }),
    create: vi.fn().mockResolvedValue({}),
  },
  findOne: vi.fn().mockResolvedValue({ role: "admin", userEmail: "teacher@test.com" }),
}));

// Mock ensureRole middleware. The key insight: ensureRole() is called at route DEFINITION time
// to produce a middleware function. We need to return a stable middleware that delegates to a
// configurable handler so we can change behavior per-test.
const { ensureRoleHandler } = vi.hoisted(() => ({
  ensureRoleHandler: { fn: (_req: any, _res: any, next: any) => next() },
}));
vi.mock("../../src/shared/middleware/ensureRole", () => ({
  ensureRole: (..._roles: string[]) => (req: any, res: any, next: any) => ensureRoleHandler.fn(req, res, next),
}));

vi.mock("../../Models/Company", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Test Org", slug: "test-org" }),
  },
}));

// ---- Mock services ----
const mockGetStudentAnalytics = vi.fn();
const mockGetStudentScoreTrend = vi.fn();
const mockGetStudentSubjectRadar = vi.fn();
const mockGetStudentTopicDrilldown = vi.fn();
const mockGetStudentTestComparison = vi.fn();
const mockGetStudentTimeTrend = vi.fn();

vi.mock("../../src/services/studentAnalyticsService", () => ({
  getStudentAnalytics: (...args: unknown[]) => mockGetStudentAnalytics(...args),
  getStudentScoreTrend: (...args: unknown[]) => mockGetStudentScoreTrend(...args),
  getStudentSubjectRadar: (...args: unknown[]) => mockGetStudentSubjectRadar(...args),
  getStudentTopicDrilldown: (...args: unknown[]) => mockGetStudentTopicDrilldown(...args),
  getStudentTestComparison: (...args: unknown[]) => mockGetStudentTestComparison(...args),
  getStudentTimeTrend: (...args: unknown[]) => mockGetStudentTimeTrend(...args),
}));

const mockGetClassAnalytics = vi.fn();
const mockGetClassTestAnalytics = vi.fn();
const mockGetClassTopicHeatmap = vi.fn();
const mockGetClassComparisonAcrossTests = vi.fn();
const mockGetClassStudentRankings = vi.fn();

vi.mock("../../src/services/classAnalyticsService", () => ({
  getClassAnalytics: (...args: unknown[]) => mockGetClassAnalytics(...args),
  getClassTestAnalytics: (...args: unknown[]) => mockGetClassTestAnalytics(...args),
  getClassTopicHeatmap: (...args: unknown[]) => mockGetClassTopicHeatmap(...args),
  getClassComparisonAcrossTests: (...args: unknown[]) => mockGetClassComparisonAcrossTests(...args),
  getClassStudentRankings: (...args: unknown[]) => mockGetClassStudentRankings(...args),
}));

const mockGetInstituteOverview = vi.fn();
const mockGetEnrollmentTrends = vi.fn();
const mockGetTeacherActivity = vi.fn();
const mockGetContentUsage = vi.fn();
const mockGetStudentRetention = vi.fn();
const mockGetQuestionBankStats = vi.fn();

vi.mock("../../src/services/instituteAnalyticsService", () => ({
  getInstituteOverview: (...args: unknown[]) => mockGetInstituteOverview(...args),
  getEnrollmentTrends: (...args: unknown[]) => mockGetEnrollmentTrends(...args),
  getTeacherActivity: (...args: unknown[]) => mockGetTeacherActivity(...args),
  getContentUsage: (...args: unknown[]) => mockGetContentUsage(...args),
  getStudentRetention: (...args: unknown[]) => mockGetStudentRetention(...args),
  getQuestionBankStats: (...args: unknown[]) => mockGetQuestionBankStats(...args),
}));

const mockListQuestionAnalytics = vi.fn();
const mockGetProblematicQuestions = vi.fn();
const mockGetDifficultyCalibrationReport = vi.fn();
const mockGetQuestionAnalytics = vi.fn();

vi.mock("../../src/services/questionAnalyticsService", () => ({
  listQuestionAnalytics: (...args: unknown[]) => mockListQuestionAnalytics(...args),
  getProblematicQuestions: (...args: unknown[]) => mockGetProblematicQuestions(...args),
  getDifficultyCalibrationReport: (...args: unknown[]) => mockGetDifficultyCalibrationReport(...args),
  getQuestionAnalytics: (...args: unknown[]) => mockGetQuestionAnalytics(...args),
}));

const mockComputeQualificationBand = vi.fn();
const mockComputeComponentScores = vi.fn();
const mockComputeCohortPercentile = vi.fn();

vi.mock("../../src/services/elevenPlusAnalyticsService", () => ({
  computeQualificationBand: (...args: unknown[]) => mockComputeQualificationBand(...args),
  computeComponentScores: (...args: unknown[]) => mockComputeComponentScores(...args),
  computeCohortPercentile: (...args: unknown[]) => mockComputeCohortPercentile(...args),
}));

vi.mock("../../src/services/reportService", () => ({
  generateReport: vi.fn(),
  getReport: vi.fn(),
  listReports: vi.fn(),
  deleteReport: vi.fn(),
  generateBulkClassReports: vi.fn(),
  getStudentReports: vi.fn(),
  downloadReport: vi.fn(),
}));

// Mock other services loaded by server.ts
vi.mock("../../src/services/studentService", () => ({
  registerStudent: vi.fn(),
  joinOrganization: vi.fn(),
  getStudentProfile: vi.fn(),
  updateStudentProfile: vi.fn(),
  getStudentDashboard: vi.fn(),
  getStudentTests: vi.fn(),
  getStudentResults: vi.fn(),
  getStudentResultDetail: vi.fn(),
  getStudentPerformance: vi.fn(),
}));

vi.mock("../../src/services/parentService", () => ({
  registerParent: vi.fn(),
  linkChild: vi.fn(),
  unlinkChild: vi.fn(),
  getLinkedChildren: vi.fn(),
  getParentDashboard: vi.fn(),
  getChildTests: vi.fn(),
  getChildResults: vi.fn(),
  getChildResultDetail: vi.fn(),
  getChildPerformance: vi.fn(),
  getChildAnalytics: vi.fn(),
}));

// Mock validation schemas (passthrough)
vi.mock("../../src/shared/validation/analyticsValidation", () => ({
  analyticsQuerySchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  topicDrilldownSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  classTestAnalyticsSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  questionAnalyticsFilterSchema: {
    safeParse: (data: unknown) => ({
      success: true,
      data: { page: 1, pageSize: 20, ...(data as Record<string, unknown>) },
    }),
  },
}));

vi.mock("../../src/shared/validation/studentValidation", () => ({
  studentSignupSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  joinOrgSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateStudentProfileSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

vi.mock("../../src/shared/validation/parentValidation", () => ({
  parentSignupSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  linkChildSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

vi.mock("../../src/shared/validation/reportValidation", () => ({
  generateReportSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  bulkGenerateSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (_req: any, _res: any, next: any) => next(),
  isParent: (_req: any, _res: any, next: any) => next(),
  isParentOf: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../src/queue/queues", () => ({
  addReportGenerationJob: vi.fn().mockResolvedValue(undefined),
  addAnalyticsRecomputeJob: vi.fn().mockResolvedValue(undefined),
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const STUDENT_ID = new mongoose.Types.ObjectId().toString();
const CLASS_ID = new mongoose.Types.ObjectId().toString();
const TEST_ID = new mongoose.Types.ObjectId().toString();
const SUBJECT_ID = new mongoose.Types.ObjectId().toString();
const QUESTION_ID = new mongoose.Types.ObjectId().toString();

const ANALYTICS_BASE = `/api/v2/companies/${COMPANY_ID}/analytics`;
const CLASS_ANALYTICS_BASE = `/api/v2/companies/${COMPANY_ID}/classes/${CLASS_ID}/analytics`;
const INSTITUTE_BASE = `/api/v2/companies/${COMPANY_ID}/analytics/institute`;
const QUESTION_ANALYTICS_BASE = `/api/v2/companies/${COMPANY_ID}/analytics/questions`;
const STUDENT_SELF_BASE = `/api/v2/student`;

let app: ReturnType<typeof buildApp>;

function authed(req: request.Test): request.Test {
  return req.set("Authorization", `Bearer ${TEACHER_TOKEN}`);
}

describe("Analytics API Integration Tests", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ensureRole passes through
    ensureRoleHandler.fn = (_req: any, _res: any, next: any) => next();
  });

  // ─── Student Analytics (teacher-facing) ──────────────────────────────

  describe("GET /analytics/students/:studentId", () => {
    it("returns student analytics (200)", async () => {
      const analyticsData = {
        overallStats: { averagePercentage: 75, totalTestsTaken: 10 },
        testPerformance: [],
        topicPerformance: [],
      };
      mockGetStudentAnalytics.mockResolvedValue(analyticsData);

      const res = await authed(
        request(app).get(`${ANALYTICS_BASE}/students/${STUDENT_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetStudentAnalytics).toHaveBeenCalledWith(
        COMPANY_ID,
        STUDENT_ID,
        expect.any(Object)
      );
    });
  });

  describe("GET /analytics/students/:studentId/score-trend", () => {
    it("returns score trend time series (200)", async () => {
      const trendData = [
        { testTitle: "Test 1", percentage: 70, date: "2026-01-01" },
        { testTitle: "Test 2", percentage: 85, date: "2026-01-15" },
      ];
      mockGetStudentScoreTrend.mockResolvedValue(trendData);

      const res = await authed(
        request(app).get(`${ANALYTICS_BASE}/students/${STUDENT_ID}/score-trend`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.trend).toHaveLength(2);
    });
  });

  describe("GET /analytics/students/:studentId/subject-radar", () => {
    it("returns subject radar data (200)", async () => {
      const radarData = [
        { subjectName: "Math", accuracy: 85 },
        { subjectName: "English", accuracy: 70 },
      ];
      mockGetStudentSubjectRadar.mockResolvedValue(radarData);

      const res = await authed(
        request(app).get(`${ANALYTICS_BASE}/students/${STUDENT_ID}/subject-radar`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.subjects).toHaveLength(2);
    });
  });

  // ─── Class Analytics ─────────────────────────────────────────────────

  describe("GET /classes/:classId/analytics", () => {
    it("returns class overview analytics (200)", async () => {
      const classData = {
        studentCount: 25,
        testCount: 8,
        overallAverageScore: 72,
      };
      mockGetClassAnalytics.mockResolvedValue(classData);

      const res = await authed(
        request(app).get(CLASS_ANALYTICS_BASE)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetClassAnalytics).toHaveBeenCalledWith(COMPANY_ID, CLASS_ID);
    });
  });

  describe("GET /classes/:classId/analytics/tests/:testId", () => {
    it("returns class test analytics (200)", async () => {
      const testData = {
        scoreStats: { avg: 68, median: 70 },
        scoreDistribution: [],
        topPerformers: [],
        completionRate: 90,
      };
      mockGetClassTestAnalytics.mockResolvedValue(testData);

      const res = await authed(
        request(app).get(`${CLASS_ANALYTICS_BASE}/tests/${TEST_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetClassTestAnalytics).toHaveBeenCalledWith(COMPANY_ID, CLASS_ID, TEST_ID);
    });
  });

  describe("GET /classes/:classId/analytics/heatmap/:subjectId", () => {
    it("returns topic heatmap data (200)", async () => {
      const heatmapData = {
        students: [{ name: "Alice", topicAccuracies: {} }],
        topics: [{ id: "t1", name: "Algebra" }],
      };
      mockGetClassTopicHeatmap.mockResolvedValue(heatmapData);

      const res = await authed(
        request(app).get(`${CLASS_ANALYTICS_BASE}/heatmap/${SUBJECT_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetClassTopicHeatmap).toHaveBeenCalledWith(COMPANY_ID, CLASS_ID, SUBJECT_ID);
    });
  });

  // ─── Institute Analytics ─────────────────────────────────────────────

  describe("GET /analytics/institute/overview", () => {
    it("returns institute KPIs for admin (200)", async () => {
      const overview = {
        totalStudents: 500,
        activeStudents: 450,
        totalTests: 100,
        averageScore: 72,
      };
      mockGetInstituteOverview.mockResolvedValue(overview);

      const res = await authed(
        request(app).get(`${INSTITUTE_BASE}/overview`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetInstituteOverview).toHaveBeenCalled();
    });

    it("returns 403 for non-admin user", async () => {
      // Override ensureRole handler to reject for this test
      ensureRoleHandler.fn = (_req: any, res: any, _next: any) => {
        return res.status(403).sendEnvelope("requires one of: admin, owner", "error");
      };

      const res = await authed(
        request(app).get(`${INSTITUTE_BASE}/overview`)
      ).expect(403);

      expect(res.body.message).toContain("requires one of");
    });
  });

  // ─── Question Analytics ──────────────────────────────────────────────

  describe("GET /analytics/questions", () => {
    it("returns filterable question analytics (200)", async () => {
      const result = {
        questions: [{ questionId: QUESTION_ID, accuracy: 75 }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      mockListQuestionAnalytics.mockResolvedValue(result);

      const res = await authed(
        request(app).get(`${QUESTION_ANALYTICS_BASE}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockListQuestionAnalytics).toHaveBeenCalled();
    });
  });

  describe("GET /analytics/questions/problematic", () => {
    it("returns flagged problematic questions (200)", async () => {
      const questions = [
        { questionId: QUESTION_ID, issues: ["Low discrimination index"] },
      ];
      mockGetProblematicQuestions.mockResolvedValue(questions);

      const res = await authed(
        request(app).get(`${QUESTION_ANALYTICS_BASE}/problematic`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.questions).toHaveLength(1);
    });
  });

  // ─── Question Analytics Detail ─────────────────────────────────────

  describe("GET /analytics/questions/:questionId", () => {
    it("returns single question analytics (200)", async () => {
      const questionData = {
        questionId: QUESTION_ID,
        accuracy: 65,
        discriminationIndex: 0.45,
        totalAttempts: 100,
      };
      mockGetQuestionAnalytics.mockResolvedValue(questionData);

      const res = await authed(
        request(app).get(`${QUESTION_ANALYTICS_BASE}/${QUESTION_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetQuestionAnalytics).toHaveBeenCalledWith(COMPANY_ID, QUESTION_ID);
    });
  });

  // ─── Tenant Isolation ────────────────────────────────────────────────

  describe("tenant isolation", () => {
    it("scopes analytics to the company in URL params", async () => {
      const OTHER_COMPANY = new mongoose.Types.ObjectId().toString();
      mockGetStudentAnalytics.mockResolvedValue({ overallStats: {} });

      await authed(
        request(app).get(`/api/v2/companies/${OTHER_COMPANY}/analytics/students/${STUDENT_ID}`)
      ).expect(200);

      expect(mockGetStudentAnalytics).toHaveBeenCalledWith(
        OTHER_COMPANY,
        STUDENT_ID,
        expect.any(Object)
      );
    });
  });

  // ─── Error Handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 404 when service throws not found", async () => {
      mockGetStudentAnalytics.mockRejectedValue(
        Object.assign(new Error("Student not found"), { status: 404 })
      );

      const res = await authed(
        request(app).get(`${ANALYTICS_BASE}/students/${STUDENT_ID}`)
      ).expect(404);

      expect(res.body.message).toContain("Student not found");
    });

    it("returns 500 for unexpected service errors", async () => {
      mockGetClassAnalytics.mockRejectedValue(new Error("Database error"));

      const res = await authed(
        request(app).get(CLASS_ANALYTICS_BASE)
      ).expect(500);

      expect(res.body.message).toContain("Database error");
    });
  });

  // ─── Unauthenticated Access ──────────────────────────────────────────

  describe("unauthenticated access", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app)
        .get(`${ANALYTICS_BASE}/students/${STUDENT_ID}`)
        .expect(401);

      expect(res.body.message).toContain("unauthenticated");
    });
  });
});
