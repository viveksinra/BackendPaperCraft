import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseCreate = vi.fn();
const mockCourseFindOne = vi.fn();
const mockCourseFind = vi.fn();
const mockCourseCountDocuments = vi.fn();
const mockCourseFindOneAndUpdate = vi.fn();
const mockCourseDeleteOne = vi.fn();
const mockCourseAggregate = vi.fn();
const mockEnrollmentCountDocuments = vi.fn();
const mockEnrollmentDeleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
const mockEnrollmentFindOne = vi.fn();
const mockEnrollmentFind = vi.fn();
const mockProductCreate = vi.fn();

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    create: (...args: unknown[]) => mockCourseCreate(...args),
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
    find: (...args: unknown[]) => {
      mockCourseFind(...args);
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    },
    countDocuments: (...args: unknown[]) => mockCourseCountDocuments(...args),
    findOneAndUpdate: (...args: unknown[]) => mockCourseFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => mockCourseDeleteOne(...args),
    aggregate: (...args: unknown[]) => mockCourseAggregate(...args),
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    countDocuments: (...args: unknown[]) => mockEnrollmentCountDocuments(...args),
    deleteMany: (...args: unknown[]) => mockEnrollmentDeleteMany(...args),
    findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
    find: (...args: unknown[]) => {
      mockEnrollmentFind(...args);
      return {
        select: () => ({
          sort: () => ({
            limit: () => ({
              lean: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    },
  },
}));

vi.mock("../../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Must mock mongoose.model for Product
vi.mock("mongoose", async () => {
  const actual = await vi.importActual<typeof import("mongoose")>("mongoose");
  return {
    ...actual,
    default: {
      ...actual,
      models: {},
      model: vi.fn().mockReturnValue({
        create: (...args: unknown[]) => mockProductCreate(...args),
      }),
    },
  };
});

import {
  createCourse,
  getCourseById,
  updateCourse,
  deleteCourse,
  publishCourse,
  unpublishCourse,
  archiveCourse,
  browseCatalog,
  getCourseDetail,
} from "../../../src/services/courseService";

// ─── Data ─────────────────────────────────────────────────────────────────

const TENANT = "testTenant";
const COMPANY = new mongoose.Types.ObjectId().toString();
const USER = "teacher@test.com";
const USER_ID = new mongoose.Types.ObjectId().toString();

function makeCourse(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    title: "Test Course",
    slug: "test-course",
    description: "A test course",
    status: "draft",
    sections: [],
    pricing: { isFree: true },
    stats: { totalLessons: 0, totalDurationMinutes: 0, enrollmentCount: 0 },
    tags: [],
    createdBy: USER,
    updatedBy: USER,
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("courseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCourse", () => {
    it("creates a draft course with slug", async () => {
      mockCourseFindOne.mockResolvedValue(null); // no slug collision
      const created = makeCourse();
      mockCourseCreate.mockResolvedValue(created);

      const result = await createCourse(TENANT, COMPANY, {
        title: "Test Course",
        description: "A test course",
        teacherId: USER_ID,
      }, USER);

      expect(mockCourseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          title: "Test Course",
          status: "draft",
        })
      );
      expect(result).toBeDefined();
    });

    it("handles slug collisions by appending suffix", async () => {
      mockCourseFindOne
        .mockResolvedValueOnce({ slug: "test-course" }) // first slug taken
        .mockResolvedValueOnce(null); // second slug free
      const created = makeCourse({ slug: "test-course-abc12" });
      mockCourseCreate.mockResolvedValue(created);

      const result = await createCourse(TENANT, COMPANY, {
        title: "Test Course",
        teacherId: USER_ID,
      }, USER);

      expect(result).toBeDefined();
    });
  });

  describe("updateCourse", () => {
    it("updates allowed fields on draft course", async () => {
      const course = makeCourse();
      mockCourseFindOne.mockResolvedValue(course);

      await updateCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), {
        title: "Updated Title",
      }, USER);

      expect(course.save).toHaveBeenCalled();
    });

    it("rejects updates on archived courses", async () => {
      const archived = makeCourse({ status: "archived" });
      mockCourseFindOne.mockResolvedValue(archived);

      await expect(
        updateCourse(TENANT, COMPANY, (archived._id as mongoose.Types.ObjectId).toString(), { title: "X" }, USER)
      ).rejects.toThrow();
    });
  });

  describe("publishCourse", () => {
    it("publishes a valid draft course", async () => {
      const course = makeCourse({
        status: "draft",
        thumbnail: "thumb.jpg",
        sections: [
          {
            title: "S1",
            lessons: [
              { title: "L1", type: "text", content: { textContent: "<p>Hi</p>", videoUrl: "", pdfUrl: "", testId: null, resourceFiles: [] }, estimatedMinutes: 5 },
            ],
          },
        ],
      });
      mockCourseFindOne.mockResolvedValue(course);

      await publishCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), USER);

      expect(course.save).toHaveBeenCalled();
    });

    it("rejects publishing course with no sections", async () => {
      const course = makeCourse({ status: "draft", sections: [] });
      mockCourseFindOne.mockResolvedValue(course);

      await expect(
        publishCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), USER)
      ).rejects.toThrow();
    });

    it("rejects publishing course with empty lessons", async () => {
      const course = makeCourse({
        status: "draft",
        sections: [{ title: "S1", lessons: [] }],
      });
      mockCourseFindOne.mockResolvedValue(course);

      await expect(
        publishCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), USER)
      ).rejects.toThrow();
    });
  });

  describe("unpublishCourse", () => {
    it("unpublishes a published course", async () => {
      const course = makeCourse({ status: "published" });
      mockCourseFindOne.mockResolvedValue(course);

      await unpublishCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), USER);

      expect(course.save).toHaveBeenCalled();
    });
  });

  describe("archiveCourse", () => {
    it("archives a published course", async () => {
      const course = makeCourse({ status: "published" });
      mockCourseFindOne.mockResolvedValue(course);

      await archiveCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString(), USER);

      expect(course.save).toHaveBeenCalled();
    });
  });

  describe("deleteCourse", () => {
    it("deletes a draft course", async () => {
      const course = makeCourse({ status: "draft" });
      mockCourseFindOne.mockResolvedValue(course);
      mockCourseDeleteOne.mockResolvedValue({ deletedCount: 1 });
      mockEnrollmentDeleteMany.mockResolvedValue({ deletedCount: 0 });

      await deleteCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString());

      expect(mockCourseDeleteOne).toHaveBeenCalled();
    });

    it("rejects deleting a published course", async () => {
      const course = makeCourse({ status: "published" });
      mockCourseFindOne.mockResolvedValue(course);

      await expect(
        deleteCourse(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString())
      ).rejects.toThrow();
    });
  });

  describe("getCourseById", () => {
    it("returns course for valid id", async () => {
      const course = makeCourse();
      mockCourseFindOne.mockResolvedValue(course);

      const result = await getCourseById(TENANT, COMPANY, (course._id as mongoose.Types.ObjectId).toString());

      expect(result).toBeDefined();
      expect(result.title).toBe("Test Course");
    });

    it("throws for non-existent course", async () => {
      mockCourseFindOne.mockResolvedValue(null);

      await expect(
        getCourseById(TENANT, COMPANY, new mongoose.Types.ObjectId().toString())
      ).rejects.toThrow();
    });
  });
});
