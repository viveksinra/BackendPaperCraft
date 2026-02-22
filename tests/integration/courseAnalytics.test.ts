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

// Mock ensureRole - configurable per test
const { ensureRoleHandler } = vi.hoisted(() => ({
  ensureRoleHandler: { fn: (_req: any, _res: any, next: any) => next() },
}));
vi.mock("../../src/shared/middleware/ensureRole", () => ({
  ensureRole: (..._roles: string[]) => (req: any, res: any, next: any) => ensureRoleHandler.fn(req, res, next),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/courseValidation", () => ({
  createCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  browseCatalogSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

// Mock courseAnalyticsService
const mockGetCourseAnalytics = vi.fn();
const mockGetLessonAnalytics = vi.fn();
const mockGetInstituteCourseAnalytics = vi.fn();

vi.mock("../../src/services/courseAnalyticsService", () => ({
  getCourseAnalytics: (...args: unknown[]) => mockGetCourseAnalytics(...args),
  getLessonAnalytics: (...args: unknown[]) => mockGetLessonAnalytics(...args),
  getInstituteCourseAnalytics: (...args: unknown[]) => mockGetInstituteCourseAnalytics(...args),
}));

// Mock enrollmentService
const mockGetCourseEnrollments = vi.fn();

vi.mock("../../src/services/enrollmentService", () => ({
  getCourseEnrollments: (...args: unknown[]) => mockGetCourseEnrollments(...args),
}));

// Mock CourseEnrollmentModel (used directly in reviews route)
vi.mock("../../src/models/courseEnrollment", () => {
  const chainable = (val: unknown) => {
    const obj: Record<string, any> = {};
    obj.sort = vi.fn().mockReturnValue(obj);
    obj.skip = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockReturnValue(obj);
    obj.select = vi.fn().mockReturnValue(obj);
    obj.lean = vi.fn().mockResolvedValue(val);
    return obj;
  };
  return {
    CourseEnrollmentModel: {
      find: vi.fn().mockReturnValue(chainable([])),
      findOne: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
  };
});

vi.mock("../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const COURSE_ID = new mongoose.Types.ObjectId().toString();
const LESSON_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/course-analytics`;

let app: ReturnType<typeof buildApp>;

describe("Course Analytics API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ensureRoleHandler.fn = (_req: any, _res: any, next: any) => next();
  });

  // ─── Course Analytics ──────────────────────────────────────────

  describe("GET /:courseId/analytics", () => {
    it("returns analytics overview (teacher auth)", async () => {
      mockGetCourseAnalytics.mockResolvedValue({
        totalEnrollments: 50,
        activeStudents: 30,
        completionRate: 0.6,
        avgRating: 4.5,
        completionFunnel: [],
      });

      const res = await request(app)
        .get(`${BASE}/${COURSE_ID}/analytics`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.totalEnrollments).toBe(50);
      expect(mockGetCourseAnalytics).toHaveBeenCalledWith("testTenant", COMPANY_ID, COURSE_ID);
    });

    it("returns 403 for unauthorized role", async () => {
      ensureRoleHandler.fn = (_req: any, res: any) =>
        res.status(403).sendEnvelope("forbidden", "error");

      const res = await request(app)
        .get(`${BASE}/${COURSE_ID}/analytics`)
        .expect(403);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── Funnel ────────────────────────────────────────────────────

  describe("GET /:courseId/analytics/funnel", () => {
    it("returns completion funnel data", async () => {
      mockGetCourseAnalytics.mockResolvedValue({
        completionFunnel: [
          { lessonTitle: "L1", completionCount: 50 },
          { lessonTitle: "L2", completionCount: 40 },
        ],
      });

      const res = await request(app)
        .get(`${BASE}/${COURSE_ID}/analytics/funnel`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.completionFunnel).toHaveLength(2);
    });
  });

  // ─── Enrollments ───────────────────────────────────────────────

  describe("GET /:courseId/analytics/enrollments", () => {
    it("returns enrollment list with pagination", async () => {
      mockGetCourseEnrollments.mockResolvedValue({
        enrollments: [{ studentUserId: "s1", status: "active" }],
        total: 1,
        page: 1,
        pages: 1,
      });

      const res = await request(app)
        .get(`${BASE}/${COURSE_ID}/analytics/enrollments`)
        .query({ page: "1", limit: "20" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetCourseEnrollments).toHaveBeenCalled();
    });
  });

  // ─── Institute analytics ──────────────────────────────────────

  describe("GET / (institute-level)", () => {
    it("returns institute course analytics (admin auth)", async () => {
      mockGetInstituteCourseAnalytics.mockResolvedValue({
        totalCourses: 10,
        totalEnrollments: 200,
        avgCompletionRate: 0.55,
      });

      const res = await request(app)
        .get(BASE)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.totalCourses).toBe(10);
    });

    it("returns 403 for non-admin role", async () => {
      ensureRoleHandler.fn = (_req: any, res: any) =>
        res.status(403).sendEnvelope("forbidden", "error");

      const res = await request(app)
        .get(BASE)
        .expect(403);

      expect(res.body.variant).toBe("error");
    });
  });
});
