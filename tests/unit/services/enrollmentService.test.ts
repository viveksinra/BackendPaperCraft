import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseFindOne = vi.fn();
const mockEnrollmentCreate = vi.fn();
const mockEnrollmentFindOne = vi.fn();
const mockEnrollmentFind = vi.fn();
const mockEnrollmentCountDocuments = vi.fn();
const mockEnrollmentFindOneAndUpdate = vi.fn();

function chainable(resolvedValue: unknown) {
  const obj: Record<string, unknown> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.select = vi.fn().mockReturnValue(obj);
  obj.populate = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return obj;
}

const mockCourseUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
    findOneAndUpdate: vi.fn(),
    updateOne: (...args: unknown[]) => mockCourseUpdateOne(...args),
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    create: (...args: unknown[]) => mockEnrollmentCreate(...args),
    findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
    find: (...args: unknown[]) => {
      mockEnrollmentFind(...args);
      return chainable([]);
    },
    countDocuments: (...args: unknown[]) => mockEnrollmentCountDocuments(...args),
    findOneAndUpdate: (...args: unknown[]) => mockEnrollmentFindOneAndUpdate(...args),
  },
}));

vi.mock("../../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../src/queue/queues", () => ({
  addNotificationJob: vi.fn().mockResolvedValue(undefined),
  addGamificationEventJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/services/notificationEventHandlers", () => ({
  onCourseEnrolled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("mongoose", async () => {
  const actual = await vi.importActual<typeof import("mongoose")>("mongoose");
  return {
    ...actual,
    default: {
      ...actual,
      models: {},
      model: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    },
  };
});

import {
  enrollStudent,
  isEnrolled,
  getStudentEnrollments,
  dropEnrollment,
} from "../../../src/services/enrollmentService";

// ─── Data ─────────────────────────────────────────────────────────────────

const TENANT = "testTenant";
const COMPANY = new mongoose.Types.ObjectId().toString();
const STUDENT = new mongoose.Types.ObjectId().toString();
const COURSE_ID = new mongoose.Types.ObjectId().toString();

const ENROLLED_BY = new mongoose.Types.ObjectId().toString();

function makeCourse(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(COURSE_ID),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    title: "Test Course",
    status: "published",
    pricing: { isFree: true },
    stats: { enrollmentCount: 0 },
    sections: [
      {
        _id: new mongoose.Types.ObjectId(),
        order: 0,
        lessons: [{ _id: new mongoose.Types.ObjectId(), order: 0 }],
      },
    ],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("enrollmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enrollStudent", () => {
    it("creates enrollment for free published course", async () => {
      const course = makeCourse();
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(null); // no existing enrollment
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        status: "active",
      };
      mockEnrollmentCreate.mockResolvedValue(enrollment);

      const result = await enrollStudent({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        enrolledByUserId: ENROLLED_BY,
      });

      expect(mockEnrollmentCreate).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("rejects enrollment in unpublished course", async () => {
      const course = makeCourse({ status: "draft" });
      mockCourseFindOne.mockResolvedValue(course);

      await expect(
        enrollStudent({
          tenantId: TENANT,
          companyId: COMPANY,
          courseId: COURSE_ID,
          studentUserId: STUDENT,
          enrolledByUserId: ENROLLED_BY,
        })
      ).rejects.toThrow();
    });

    it("rejects paid course without purchase", async () => {
      const course = makeCourse({ pricing: { isFree: false, basePrice: 2999 } });
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(null);

      await expect(
        enrollStudent({
          tenantId: TENANT,
          companyId: COMPANY,
          courseId: COURSE_ID,
          studentUserId: STUDENT,
          enrolledByUserId: ENROLLED_BY,
        })
      ).rejects.toThrow();
    });
  });

  describe("isEnrolled", () => {
    it("returns true when enrolled", async () => {
      mockEnrollmentCountDocuments.mockResolvedValue(1);

      const result = await isEnrolled(TENANT, COMPANY, COURSE_ID, STUDENT);

      expect(result).toBe(true);
    });

    it("returns false when not enrolled", async () => {
      mockEnrollmentCountDocuments.mockResolvedValue(0);

      const result = await isEnrolled(TENANT, COMPANY, COURSE_ID, STUDENT);

      expect(result).toBe(false);
    });
  });

  describe("getStudentEnrollments", () => {
    it("returns enrollments with pagination", async () => {
      mockEnrollmentCountDocuments.mockResolvedValue(5);

      const result = await getStudentEnrollments(TENANT, COMPANY, STUDENT, {
        page: 1,
        pageSize: 10,
      });

      expect(mockEnrollmentFind).toHaveBeenCalled();
    });
  });

  describe("dropEnrollment", () => {
    it("sets status to dropped", async () => {
      const enrollment = {
        _id: new mongoose.Types.ObjectId(),
        status: "active",
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockEnrollmentFindOne.mockResolvedValue(enrollment);
      const course = makeCourse();
      mockCourseFindOne.mockResolvedValue(course);

      await dropEnrollment(TENANT, COMPANY, COURSE_ID, STUDENT);

      expect(enrollment.save).toHaveBeenCalled();
    });
  });
});
