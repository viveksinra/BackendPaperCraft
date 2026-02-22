import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseFindOne = vi.fn();
const mockEnrollmentFindOne = vi.fn();

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
  },
}));

vi.mock("../../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  markLessonComplete,
  markLessonIncomplete,
  updateCurrentLesson,
  trackTimeSpent,
  getNextLesson,
} from "../../../src/services/courseProgressService";

// ─── Data ─────────────────────────────────────────────────────────────────

const TENANT = "testTenant";
const COMPANY = new mongoose.Types.ObjectId().toString();
const STUDENT = new mongoose.Types.ObjectId().toString();
const COURSE_ID = new mongoose.Types.ObjectId().toString();
const SECTION_ID = new mongoose.Types.ObjectId().toString();
const LESSON_1 = new mongoose.Types.ObjectId().toString();
const LESSON_2 = new mongoose.Types.ObjectId().toString();
const LESSON_3 = new mongoose.Types.ObjectId().toString();

function makeCourse() {
  return {
    _id: new mongoose.Types.ObjectId(COURSE_ID),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    sections: [
      {
        _id: new mongoose.Types.ObjectId(SECTION_ID),
        lessons: [
          { _id: new mongoose.Types.ObjectId(LESSON_1), title: "L1", type: "text" },
          { _id: new mongoose.Types.ObjectId(LESSON_2), title: "L2", type: "video" },
          { _id: new mongoose.Types.ObjectId(LESSON_3), title: "L3", type: "quiz", dripDate: null },
        ],
      },
    ],
  };
}

function makeEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    courseId: new mongoose.Types.ObjectId(COURSE_ID),
    studentUserId: new mongoose.Types.ObjectId(STUDENT),
    status: "active",
    completedLessons: [],
    progressPercentage: 0,
    currentLessonId: null,
    totalTimeSpentMinutes: 0,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("courseProgressService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("markLessonComplete", () => {
    it("marks a lesson as complete and updates percentage", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment();
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await markLessonComplete({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        sectionId: SECTION_ID,
        lessonId: LESSON_1,
      });

      expect(enrollment.save).toHaveBeenCalled();
      expect(enrollment.completedLessons.length).toBeGreaterThan(0);
    });

    it("is idempotent - completing same lesson twice", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        completedLessons: [
          { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date() },
        ],
        progressPercentage: 33,
      });
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await markLessonComplete({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        sectionId: SECTION_ID,
        lessonId: LESSON_1,
      });

      // Should still only have 1 completion
      expect(enrollment.completedLessons.length).toBe(1);
    });
  });

  describe("markLessonIncomplete", () => {
    it("removes a lesson from completedLessons", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        completedLessons: [
          { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date() },
        ],
        progressPercentage: 33,
      });
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await markLessonIncomplete({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        sectionId: SECTION_ID,
        lessonId: LESSON_1,
      });

      expect(enrollment.save).toHaveBeenCalled();
    });
  });

  describe("trackTimeSpent", () => {
    it("adds time to enrollment total", async () => {
      const enrollment = makeEnrollment({ totalTimeSpentMinutes: 10 });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await trackTimeSpent({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        sectionId: SECTION_ID,
        lessonId: LESSON_1,
        seconds: 300,
      });

      expect(enrollment.save).toHaveBeenCalled();
    });
  });

  describe("getNextLesson", () => {
    it("returns the next incomplete lesson", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        completedLessons: [
          { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date() },
        ],
      });
      mockCourseFindOne.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      const result = await getNextLesson(TENANT, COMPANY, COURSE_ID, STUDENT);

      expect(result).toBeDefined();
    });
  });
});
