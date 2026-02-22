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

// Mock ensureRole - allow per-test override
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

// Mock courseService
const mockCreateCourse = vi.fn();
const mockListCourses = vi.fn();
const mockGetCourseById = vi.fn();
const mockUpdateCourse = vi.fn();
const mockDeleteCourse = vi.fn();
const mockPublishCourse = vi.fn();
const mockUnpublishCourse = vi.fn();
const mockArchiveCourse = vi.fn();
const mockDuplicateCourse = vi.fn();
const mockBrowseCatalog = vi.fn();
const mockGetCourseDetail = vi.fn();

vi.mock("../../src/services/courseService", () => ({
  createCourse: (...args: unknown[]) => mockCreateCourse(...args),
  listCourses: (...args: unknown[]) => mockListCourses(...args),
  getCourseById: (...args: unknown[]) => mockGetCourseById(...args),
  updateCourse: (...args: unknown[]) => mockUpdateCourse(...args),
  deleteCourse: (...args: unknown[]) => mockDeleteCourse(...args),
  publishCourse: (...args: unknown[]) => mockPublishCourse(...args),
  unpublishCourse: (...args: unknown[]) => mockUnpublishCourse(...args),
  archiveCourse: (...args: unknown[]) => mockArchiveCourse(...args),
  duplicateCourse: (...args: unknown[]) => mockDuplicateCourse(...args),
  browseCatalog: (...args: unknown[]) => mockBrowseCatalog(...args),
  getCourseDetail: (...args: unknown[]) => mockGetCourseDetail(...args),
}));

// Mock CourseEnrollmentModel (used by catalog routes)
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
const COURSES_BASE = `/api/v2/companies/${COMPANY_ID}/courses`;
const CATALOG_BASE = `/api/v2/companies/${COMPANY_ID}/catalog`;

let app: ReturnType<typeof buildApp>;

describe("Courses API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ensureRoleHandler.fn = (_req: any, _res: any, next: any) => next();
  });

  // ─── POST /courses ──────────────────────────────────────────────

  describe("POST /courses", () => {
    it("creates a draft course (teacher auth)", async () => {
      const course = {
        _id: new mongoose.Types.ObjectId(),
        title: "My Course",
        status: "draft",
        slug: "my-course",
      };
      mockCreateCourse.mockResolvedValue(course);

      const res = await request(app)
        .post(COURSES_BASE)
        .send({ title: "My Course", description: "Desc" })
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.course.title).toBe("My Course");
      expect(mockCreateCourse).toHaveBeenCalledWith(
        "testTenant",
        COMPANY_ID,
        expect.objectContaining({ title: "My Course" }),
        "teacher@test.com"
      );
    });

    it("returns 403 when role is rejected", async () => {
      ensureRoleHandler.fn = (_req: any, res: any) =>
        res.status(403).sendEnvelope("forbidden", "error");

      const res = await request(app)
        .post(COURSES_BASE)
        .send({ title: "X" })
        .expect(403);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── GET /courses ───────────────────────────────────────────────

  describe("GET /courses", () => {
    it("lists courses with filters", async () => {
      mockListCourses.mockResolvedValue({
        courses: [{ title: "C1" }],
        total: 1,
        page: 1,
        pages: 1,
      });

      const res = await request(app)
        .get(COURSES_BASE)
        .query({ status: "published", page: "1", limit: "10" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockListCourses).toHaveBeenCalledWith(
        "testTenant",
        COMPANY_ID,
        expect.objectContaining({ status: "published" })
      );
    });
  });

  // ─── GET /courses/:id ──────────────────────────────────────────

  describe("GET /courses/:courseId", () => {
    it("returns course detail", async () => {
      const course = { _id: COURSE_ID, title: "Detail Course" };
      mockGetCourseById.mockResolvedValue(course);

      const res = await request(app)
        .get(`${COURSES_BASE}/${COURSE_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.course.title).toBe("Detail Course");
    });

    it("returns 500 for non-existent course", async () => {
      mockGetCourseById.mockRejectedValue(
        Object.assign(new Error("not found"), { status: 404 })
      );

      const res = await request(app)
        .get(`${COURSES_BASE}/${new mongoose.Types.ObjectId()}`)
        .expect(404);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── PATCH /courses/:id ────────────────────────────────────────

  describe("PATCH /courses/:courseId", () => {
    it("updates course fields", async () => {
      const updated = { _id: COURSE_ID, title: "Updated" };
      mockUpdateCourse.mockResolvedValue(updated);

      const res = await request(app)
        .patch(`${COURSES_BASE}/${COURSE_ID}`)
        .send({ title: "Updated" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockUpdateCourse).toHaveBeenCalled();
    });
  });

  // ─── DELETE /courses/:id ───────────────────────────────────────

  describe("DELETE /courses/:courseId", () => {
    it("deletes a draft course", async () => {
      mockDeleteCourse.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${COURSES_BASE}/${COURSE_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteCourse).toHaveBeenCalled();
    });

    it("returns error for published course", async () => {
      mockDeleteCourse.mockRejectedValue(
        Object.assign(new Error("cannot delete published course"), { status: 400 })
      );

      const res = await request(app)
        .delete(`${COURSES_BASE}/${COURSE_ID}`)
        .expect(400);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── POST /courses/:id/publish ─────────────────────────────────

  describe("POST /courses/:courseId/publish", () => {
    it("publishes a valid course", async () => {
      const published = { _id: COURSE_ID, status: "published" };
      mockPublishCourse.mockResolvedValue(published);

      const res = await request(app)
        .post(`${COURSES_BASE}/${COURSE_ID}/publish`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockPublishCourse).toHaveBeenCalled();
    });

    it("returns 400 for empty course", async () => {
      mockPublishCourse.mockRejectedValue(
        Object.assign(new Error("course must have sections"), { status: 400 })
      );

      const res = await request(app)
        .post(`${COURSES_BASE}/${COURSE_ID}/publish`)
        .expect(400);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── Catalog routes ────────────────────────────────────────────

  describe("GET /catalog/courses", () => {
    it("returns catalog with filters", async () => {
      mockBrowseCatalog.mockResolvedValue({
        courses: [{ title: "Published" }],
        total: 1,
        page: 1,
        pages: 1,
      });

      const res = await request(app)
        .get(`${CATALOG_BASE}/courses`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockBrowseCatalog).toHaveBeenCalled();
    });
  });

  describe("GET /catalog/courses/:slug", () => {
    it("returns course detail by slug", async () => {
      const course = { title: "My Course", slug: "my-course" };
      mockGetCourseDetail.mockResolvedValue(course);

      const res = await request(app)
        .get(`${CATALOG_BASE}/courses/my-course`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.course.slug).toBe("my-course");
    });
  });
});
