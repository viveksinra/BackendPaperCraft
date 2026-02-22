import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "student@test.com" };
    req.tenantId = "testTenant";
    next();
  },
}));

// Mock User model
const STUDENT_USER_ID = new mongoose.Types.ObjectId();
const STUDENT_COMPANY_ID = new mongoose.Types.ObjectId();
vi.mock("../../Models/User", () => {
  const id = STUDENT_USER_ID;
  const mockUser = {
    _id: id,
    email: "student@test.com",
    firstName: "Test",
    lastName: "Student",
    companyId: STUDENT_COMPANY_ID,
  };
  return {
    __esModule: true,
    default: {
      findOne: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
    },
    findOne: vi.fn().mockResolvedValue(mockUser),
    findById: vi.fn().mockResolvedValue(mockUser),
  };
});

// Mock Membership model
vi.mock("../../Models/Membership", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ role: "student" }),
  },
  findOne: vi.fn().mockResolvedValue({ role: "student" }),
}));

// Mock Company model
vi.mock("../../Models/Company", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ _id: STUDENT_COMPANY_ID, name: "Test Org" }),
  },
}));

// Mock roleGuards
vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (_req: any, _res: any, next: any) => next(),
  isParent: (_req: any, _res: any, next: any) => next(),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/courseValidation", () => ({
  enrollSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  rateSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  trackTimeSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  markLessonCompleteSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  markLessonIncompleteSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateCurrentLessonSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  createCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  browseCatalogSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

// Mock ensureRole
vi.mock("../../src/shared/middleware/ensureRole", () => ({
  ensureRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

// Mock enrollmentService
const mockEnrollStudent = vi.fn();
const mockIsEnrolled = vi.fn();
const mockGetStudentEnrollments = vi.fn();
const mockGetEnrollment = vi.fn();
const mockDropEnrollment = vi.fn();
const mockGetCourseEnrollments = vi.fn();

vi.mock("../../src/services/enrollmentService", () => ({
  enrollStudent: (...args: unknown[]) => mockEnrollStudent(...args),
  isEnrolled: (...args: unknown[]) => mockIsEnrolled(...args),
  getStudentEnrollments: (...args: unknown[]) => mockGetStudentEnrollments(...args),
  getEnrollment: (...args: unknown[]) => mockGetEnrollment(...args),
  dropEnrollment: (...args: unknown[]) => mockDropEnrollment(...args),
  getCourseEnrollments: (...args: unknown[]) => mockGetCourseEnrollments(...args),
}));

// Mock courseProgressService
const mockMarkLessonComplete = vi.fn();
const mockMarkLessonIncomplete = vi.fn();
const mockTrackTimeSpent = vi.fn();
const mockGetNextLesson = vi.fn();
const mockUpdateCurrentLesson = vi.fn();

vi.mock("../../src/services/courseProgressService", () => ({
  markLessonComplete: (...args: unknown[]) => mockMarkLessonComplete(...args),
  markLessonIncomplete: (...args: unknown[]) => mockMarkLessonIncomplete(...args),
  trackTimeSpent: (...args: unknown[]) => mockTrackTimeSpent(...args),
  getNextLesson: (...args: unknown[]) => mockGetNextLesson(...args),
  updateCurrentLesson: (...args: unknown[]) => mockUpdateCurrentLesson(...args),
}));

// Mock certificateService
const mockVerifyCertificate = vi.fn();
const mockGetCertificateDownloadUrl = vi.fn();

vi.mock("../../src/services/certificateService", () => ({
  verifyCertificate: (...args: unknown[]) => mockVerifyCertificate(...args),
  getCertificateDownloadUrl: (...args: unknown[]) => mockGetCertificateDownloadUrl(...args),
  generateCertificate: vi.fn(),
}));

// Mock CourseModel and CourseEnrollmentModel
const mockCourseFindOne = vi.fn();
vi.mock("../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
  },
}));

const mockEnrollmentFind = vi.fn();
const mockEnrollmentFindOne = vi.fn();
const mockEnrollmentCountDocuments = vi.fn();
vi.mock("../../src/models/courseEnrollment", () => {
  const chainable = (val: unknown) => {
    const obj: Record<string, any> = {};
    obj.sort = vi.fn().mockReturnValue(obj);
    obj.skip = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockReturnValue(obj);
    obj.select = vi.fn().mockReturnValue(obj);
    obj.populate = vi.fn().mockReturnValue(obj);
    obj.lean = vi.fn().mockResolvedValue(val);
    return obj;
  };
  return {
    CourseEnrollmentModel: {
      find: (...args: unknown[]) => {
        mockEnrollmentFind(...args);
        return chainable([]);
      },
      findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
      countDocuments: (...args: unknown[]) => mockEnrollmentCountDocuments(...args),
      findById: vi.fn().mockResolvedValue(null),
    },
  };
});

// Mock queue
vi.mock("../../src/queue/queues", () => ({
  addCourseStatsUpdateJob: vi.fn(),
}));

vi.mock("../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildApp } from "../../src/api/server";

const COURSE_ID = new mongoose.Types.ObjectId().toString();
const LESSON_ID = new mongoose.Types.ObjectId().toString();
const ENROLLMENT_BASE = `/api/v2/courses`;
const CERT_BASE = `/api/v2/certificates`;

let app: ReturnType<typeof buildApp>;

describe("Course Enrollment & Certificate API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Enrollment ────────────────────────────────────────────────

  describe("POST /courses/:courseId/enroll", () => {
    it("enrolls in a free course", async () => {
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        courseId: COURSE_ID,
        status: "active",
      };
      mockEnrollStudent.mockResolvedValue(enrollment);

      const res = await request(app)
        .post(`${ENROLLMENT_BASE}/${COURSE_ID}/enroll`)
        .send({})
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.enrollment.status).toBe("active");
      expect(mockEnrollStudent).toHaveBeenCalled();
    });

    it("returns error for paid course without purchase", async () => {
      mockEnrollStudent.mockRejectedValue(
        Object.assign(new Error("purchase required for paid course"), { status: 402 })
      );

      const res = await request(app)
        .post(`${ENROLLMENT_BASE}/${COURSE_ID}/enroll`)
        .send({})
        .expect(402);

      expect(res.body.variant).toBe("error");
    });
  });

  describe("GET /courses/my-enrollments", () => {
    it("lists student enrollments", async () => {
      mockGetStudentEnrollments.mockResolvedValue({
        enrollments: [{ courseId: COURSE_ID, status: "active" }],
        total: 1,
        page: 1,
        pages: 1,
      });

      const res = await request(app)
        .get(`${ENROLLMENT_BASE}/my-enrollments`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockGetStudentEnrollments).toHaveBeenCalled();
    });
  });

  // ─── Progress ──────────────────────────────────────────────────

  describe("POST /courses/:courseId/lessons/:lessonId/complete", () => {
    it("marks lesson complete", async () => {
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        progressPercentage: 50,
        completedLessons: [{ lessonId: LESSON_ID }],
      };
      mockMarkLessonComplete.mockResolvedValue(enrollment);

      const res = await request(app)
        .post(`${ENROLLMENT_BASE}/${COURSE_ID}/lessons/${LESSON_ID}/complete`)
        .send({ sectionId: new mongoose.Types.ObjectId().toString() })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockMarkLessonComplete).toHaveBeenCalled();
    });
  });

  // ─── Lesson content ────────────────────────────────────────────

  describe("GET /courses/:courseId/lessons/:lessonId/content", () => {
    it("returns content for enrolled student", async () => {
      const sectionId = new mongoose.Types.ObjectId();
      const lessonObjId = new mongoose.Types.ObjectId(LESSON_ID);
      mockCourseFindOne.mockResolvedValue({
        _id: COURSE_ID,
        tenantId: "testTenant",
        companyId: STUDENT_COMPANY_ID,
        sections: [{
          _id: sectionId,
          title: "S1",
          lessons: [{
            _id: lessonObjId,
            title: "L1",
            type: "text",
            content: { textContent: "<p>Hello</p>" },
            isFree: false,
          }],
        }],
      });
      mockIsEnrolled.mockResolvedValue(true);
      mockUpdateCurrentLesson.mockResolvedValue(undefined);

      const res = await request(app)
        .get(`${ENROLLMENT_BASE}/${COURSE_ID}/lessons/${LESSON_ID}/content`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.lesson.title).toBe("L1");
    });

    it("returns 403 for non-enrolled student", async () => {
      const sectionId = new mongoose.Types.ObjectId();
      mockCourseFindOne.mockResolvedValue({
        _id: COURSE_ID,
        tenantId: "testTenant",
        companyId: STUDENT_COMPANY_ID,
        sections: [{
          _id: sectionId,
          title: "S1",
          lessons: [{
            _id: new mongoose.Types.ObjectId(LESSON_ID),
            title: "L1",
            type: "text",
            content: {},
            isFree: false,
          }],
        }],
      });
      mockIsEnrolled.mockResolvedValue(false);

      const res = await request(app)
        .get(`${ENROLLMENT_BASE}/${COURSE_ID}/lessons/${LESSON_ID}/content`)
        .expect(403);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── Rating ────────────────────────────────────────────────────

  describe("POST /courses/:courseId/rate", () => {
    it("submits a review", async () => {
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        review: null as any,
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockGetEnrollment.mockResolvedValue(enrollment);

      const res = await request(app)
        .post(`${ENROLLMENT_BASE}/${COURSE_ID}/rate`)
        .send({ rating: 5, reviewText: "Great course!" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(enrollment.save).toHaveBeenCalled();
    });
  });

  // ─── Certificates ─────────────────────────────────────────────

  describe("GET /certificates/verify/:certNumber (public)", () => {
    it("returns verified certificate data", async () => {
      mockVerifyCertificate.mockResolvedValue({
        studentName: "Test Student",
        courseName: "Test Course",
        issuedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get(`${CERT_BASE}/verify/CERT-2026-ABC12`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.studentName).toBe("Test Student");
    });

    it("returns 404 for invalid certificate", async () => {
      mockVerifyCertificate.mockResolvedValue(null);

      const res = await request(app)
        .get(`${CERT_BASE}/verify/CERT-INVALID`)
        .expect(404);

      expect(res.body.variant).toBe("error");
    });
  });
});
