import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import path from "path";

// Generate a real JWT using the actual auth module
const authModule = require(path.resolve(__dirname, "../../utils/auth"));
const TEACHER_TOKEN = authModule.signToken({ sub: "teacher@test.com" });

// ---- Mock models ----
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

// Mock ensureRole middleware. ensureRole() is called at route DEFINITION time.
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

// ---- Mock report service ----
const mockGenerateReport = vi.fn();
const mockGetReport = vi.fn();
const mockListReports = vi.fn();
const mockDeleteReport = vi.fn();
const mockGenerateBulkClassReports = vi.fn();
const mockGetStudentReports = vi.fn();
const mockDownloadReport = vi.fn();

vi.mock("../../src/services/reportService", () => ({
  generateReport: (...args: unknown[]) => mockGenerateReport(...args),
  getReport: (...args: unknown[]) => mockGetReport(...args),
  listReports: (...args: unknown[]) => mockListReports(...args),
  deleteReport: (...args: unknown[]) => mockDeleteReport(...args),
  generateBulkClassReports: (...args: unknown[]) => mockGenerateBulkClassReports(...args),
  getStudentReports: (...args: unknown[]) => mockGetStudentReports(...args),
  downloadReport: (...args: unknown[]) => mockDownloadReport(...args),
}));

// Mock other services loaded by server.ts
vi.mock("../../src/services/studentAnalyticsService", () => ({
  getStudentAnalytics: vi.fn(),
  getStudentScoreTrend: vi.fn(),
  getStudentSubjectRadar: vi.fn(),
  getStudentTopicDrilldown: vi.fn(),
  getStudentTestComparison: vi.fn(),
  getStudentTimeTrend: vi.fn(),
}));

vi.mock("../../src/services/classAnalyticsService", () => ({
  getClassAnalytics: vi.fn(),
  getClassTestAnalytics: vi.fn(),
  getClassTopicHeatmap: vi.fn(),
  getClassComparisonAcrossTests: vi.fn(),
  getClassStudentRankings: vi.fn(),
}));

vi.mock("../../src/services/instituteAnalyticsService", () => ({
  getInstituteOverview: vi.fn(),
  getEnrollmentTrends: vi.fn(),
  getTeacherActivity: vi.fn(),
  getContentUsage: vi.fn(),
  getStudentRetention: vi.fn(),
  getQuestionBankStats: vi.fn(),
}));

vi.mock("../../src/services/questionAnalyticsService", () => ({
  listQuestionAnalytics: vi.fn(),
  getProblematicQuestions: vi.fn(),
  getDifficultyCalibrationReport: vi.fn(),
  getQuestionAnalytics: vi.fn(),
}));

vi.mock("../../src/services/elevenPlusAnalyticsService", () => ({
  computeQualificationBand: vi.fn(),
  computeComponentScores: vi.fn(),
  computeCohortPercentile: vi.fn(),
}));

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
vi.mock("../../src/shared/validation/reportValidation", () => ({
  generateReportSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  bulkGenerateSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

vi.mock("../../src/shared/validation/analyticsValidation", () => ({
  analyticsQuerySchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  topicDrilldownSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  classTestAnalyticsSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  questionAnalyticsFilterSchema: { safeParse: (data: unknown) => ({ success: true, data: { page: 1, pageSize: 20 } }) },
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
const REPORT_ID = new mongoose.Types.ObjectId().toString();
const STUDENT_ID = new mongoose.Types.ObjectId().toString();
const CLASS_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/reports`;

let app: ReturnType<typeof buildApp>;

function authed(req: request.Test): request.Test {
  return req.set("Authorization", `Bearer ${TEACHER_TOKEN}`);
}

describe("Reports API Integration Tests", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ensureRole passes through
    ensureRoleHandler.fn = (_req: any, _res: any, next: any) => next();
  });

  // ─── POST /reports ───────────────────────────────────────────────────

  describe("POST /reports", () => {
    it("creates report and returns pending status (201)", async () => {
      const createdReport = {
        _id: REPORT_ID,
        type: "progress_report",
        status: "pending",
        title: "Progress Report",
      };
      mockGenerateReport.mockResolvedValue(createdReport);

      const res = await authed(
        request(app)
          .post(BASE)
          .send({ type: "progress_report", studentUserId: STUDENT_ID })
      ).expect(201);

      expect(res.body.variant).toBe("success");
      expect(mockGenerateReport).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.any(String),
        expect.objectContaining({ type: "progress_report" }),
        expect.any(String)
      );
    });

    it("propagates service errors as 500", async () => {
      mockGenerateReport.mockRejectedValue(new Error("Unexpected error"));

      const res = await authed(
        request(app).post(BASE).send({ type: "progress_report" })
      ).expect(500);

      expect(res.body.message).toContain("Unexpected error");
    });
  });

  // ─── GET /reports ────────────────────────────────────────────────────

  describe("GET /reports", () => {
    it("lists reports with filters (200)", async () => {
      const result = {
        reports: [
          { _id: REPORT_ID, type: "progress_report", status: "completed" },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      mockListReports.mockResolvedValue(result);

      const res = await authed(
        request(app).get(`${BASE}?type=progress_report&status=completed`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockListReports).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ type: "progress_report", status: "completed" }),
        expect.objectContaining({ page: 1 })
      );
    });
  });

  // ─── GET /reports/:reportId ──────────────────────────────────────────

  describe("GET /reports/:reportId", () => {
    it("returns report details (200)", async () => {
      const report = {
        _id: REPORT_ID,
        type: "progress_report",
        status: "completed",
        downloadUrl: "https://s3.example.com/report.pdf",
      };
      mockGetReport.mockResolvedValue(report);

      const res = await authed(
        request(app).get(`${BASE}/${REPORT_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetReport).toHaveBeenCalledWith(COMPANY_ID, REPORT_ID);
    });

    it("returns 404 when report not found", async () => {
      mockGetReport.mockRejectedValue(
        Object.assign(new Error("Report not found"), { status: 404 })
      );

      const res = await authed(
        request(app).get(`${BASE}/${REPORT_ID}`)
      ).expect(404);

      expect(res.body.message).toContain("Report not found");
    });
  });

  // ─── GET /reports/:reportId/download ─────────────────────────────────

  describe("GET /reports/:reportId/download", () => {
    it("returns presigned download URL for completed report (200)", async () => {
      mockDownloadReport.mockResolvedValue({
        downloadUrl: "https://s3.example.com/download/report.pdf",
      });

      const res = await authed(
        request(app).get(`${BASE}/${REPORT_ID}/download`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.downloadUrl).toContain("s3.example.com");
    });

    it("returns 400 when report not ready", async () => {
      mockDownloadReport.mockRejectedValue(
        Object.assign(new Error("Report not ready for download"), { status: 400 })
      );

      const res = await authed(
        request(app).get(`${BASE}/${REPORT_ID}/download`)
      ).expect(400);

      expect(res.body.message).toContain("not ready");
    });
  });

  // ─── POST /reports/bulk ──────────────────────────────────────────────

  describe("POST /reports/bulk", () => {
    it("creates jobs for all class students (201)", async () => {
      mockGenerateBulkClassReports.mockResolvedValue({ queued: 25 });

      const res = await authed(
        request(app)
          .post(`${BASE}/bulk`)
          .send({ classId: CLASS_ID, templateId: "standard" })
      ).expect(201);

      expect(res.body.variant).toBe("success");
      expect(mockGenerateBulkClassReports).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.any(String),
        CLASS_ID,
        "standard",
        expect.any(String)
      );
    });

    it("propagates service errors in bulk generation", async () => {
      mockGenerateBulkClassReports.mockRejectedValue(
        Object.assign(new Error("Class not found"), { status: 404 })
      );

      const res = await authed(
        request(app)
          .post(`${BASE}/bulk`)
          .send({ classId: CLASS_ID, templateId: "standard" })
      ).expect(404);

      expect(res.body.message).toContain("Class not found");
    });
  });

  // ─── DELETE /reports/:reportId ───────────────────────────────────────

  describe("DELETE /reports/:reportId", () => {
    it("deletes report for admin (200)", async () => {
      mockDeleteReport.mockResolvedValue(undefined);

      const res = await authed(
        request(app).delete(`${BASE}/${REPORT_ID}`)
      ).expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteReport).toHaveBeenCalledWith(COMPANY_ID, REPORT_ID);
    });

    it("returns 403 for non-admin user on delete", async () => {
      ensureRoleHandler.fn = (_req: any, res: any, _next: any) => {
        return res.status(403).sendEnvelope("requires one of: admin, owner", "error");
      };

      const res = await authed(
        request(app).delete(`${BASE}/${REPORT_ID}`)
      ).expect(403);

      expect(res.body.message).toContain("requires one of");
      expect(mockDeleteReport).not.toHaveBeenCalled();
    });

    it("returns 404 when deleting non-existent report", async () => {
      mockDeleteReport.mockRejectedValue(
        Object.assign(new Error("Report not found"), { status: 404 })
      );

      const res = await authed(
        request(app).delete(`${BASE}/${REPORT_ID}`)
      ).expect(404);

      expect(res.body.message).toContain("Report not found");
    });
  });

  // ─── Unauthenticated Access ──────────────────────────────────────────

  describe("unauthenticated access", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app)
        .get(BASE)
        .expect(401);

      expect(res.body.message).toContain("unauthenticated");
    });
  });
});
