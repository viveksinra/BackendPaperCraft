import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseFindOne = vi.fn();
const mockCourseFindById = vi.fn();
const mockCourseUpdateOne = vi.fn();
const mockEnrollmentFindOne = vi.fn();
const mockEnrollmentCountDocuments = vi.fn();

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
    findById: (...args: unknown[]) => mockCourseFindById(...args),
    updateOne: (...args: unknown[]) => mockCourseUpdateOne(...args),
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
    countDocuments: (...args: unknown[]) => mockEnrollmentCountDocuments(...args),
  },
}));

vi.mock("../../../src/queue/queues", () => ({
  addCertificateGenerationJob: vi.fn().mockResolvedValue(undefined),
  addNotificationJob: vi.fn().mockResolvedValue(undefined),
  addGamificationEventJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/services/notificationEventHandlers", () => ({
  onCourseCompleted: vi.fn().mockResolvedValue(undefined),
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
    certificateEnabled: false,
    title: "Test Course",
    sections: [
      {
        _id: new mongoose.Types.ObjectId(SECTION_ID),
        order: 0,
        lessons: [
          { _id: new mongoose.Types.ObjectId(LESSON_1), title: "L1", type: "text", order: 0, dripDate: null },
          { _id: new mongoose.Types.ObjectId(LESSON_2), title: "L2", type: "video", order: 1, dripDate: null },
          { _id: new mongoose.Types.ObjectId(LESSON_3), title: "L3", type: "quiz", order: 2, dripDate: null },
        ],
      },
    ],
  };
}

function makeEnrollment(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    courseId: new mongoose.Types.ObjectId(COURSE_ID),
    studentUserId: new mongoose.Types.ObjectId(STUDENT),
    status: "active",
    completedAt: null,
    progress: {
      completedLessons: [],
      percentComplete: 0,
      currentSectionId: null,
      currentLessonId: null,
      lastAccessedAt: null,
      totalTimeSpentSeconds: 0,
    },
    certificate: {
      issued: false,
      issuedAt: null,
      certificateUrl: "",
      certificateNumber: "",
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
  // Merge overrides, supporting nested progress overrides
  const result = { ...defaults, ...overrides };
  if (overrides.progress) {
    result.progress = { ...(defaults.progress as Record<string, unknown>), ...(overrides.progress as Record<string, unknown>) };
  }
  if (overrides.certificate) {
    result.certificate = { ...(defaults.certificate as Record<string, unknown>), ...(overrides.certificate as Record<string, unknown>) };
  }
  return result;
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
      mockCourseFindById.mockResolvedValue(course);
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
      expect((enrollment.progress as Record<string, unknown>).completedLessons as unknown[]).toHaveLength(1);
    });

    it("is idempotent - completing same lesson twice", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        progress: {
          completedLessons: [
            { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date(), timeSpentSeconds: 0, quizScore: null },
          ],
          percentComplete: 33,
          currentSectionId: null,
          currentLessonId: null,
          lastAccessedAt: null,
          totalTimeSpentSeconds: 0,
        },
      });
      mockCourseFindById.mockResolvedValue(course);
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
      expect((enrollment.progress as Record<string, unknown>).completedLessons as unknown[]).toHaveLength(1);
    });
  });

  describe("markLessonIncomplete", () => {
    it("removes a lesson from completedLessons", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        progress: {
          completedLessons: [
            { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date(), timeSpentSeconds: 0, quizScore: null },
          ],
          percentComplete: 33,
          currentSectionId: null,
          currentLessonId: null,
          lastAccessedAt: null,
          totalTimeSpentSeconds: 0,
        },
      });
      mockCourseFindById.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await markLessonIncomplete({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        lessonId: LESSON_1,
      });

      expect(enrollment.save).toHaveBeenCalled();
    });
  });

  describe("trackTimeSpent", () => {
    it("adds time to enrollment total", async () => {
      const enrollment = makeEnrollment({
        progress: {
          completedLessons: [],
          percentComplete: 0,
          currentSectionId: null,
          currentLessonId: null,
          lastAccessedAt: null,
          totalTimeSpentSeconds: 600,
        },
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await trackTimeSpent({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        studentUserId: STUDENT,
        lessonId: LESSON_1,
        additionalSeconds: 300,
      });

      expect(enrollment.save).toHaveBeenCalled();
    });
  });

  describe("getNextLesson", () => {
    it("returns the next incomplete lesson", async () => {
      const course = makeCourse();
      const enrollment = makeEnrollment({
        progress: {
          completedLessons: [
            { sectionId: new mongoose.Types.ObjectId(SECTION_ID), lessonId: new mongoose.Types.ObjectId(LESSON_1), completedAt: new Date(), timeSpentSeconds: 0, quizScore: null },
          ],
          percentComplete: 33,
          currentSectionId: null,
          currentLessonId: null,
          lastAccessedAt: null,
          totalTimeSpentSeconds: 0,
        },
      });
      mockCourseFindById.mockResolvedValue(course);
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      const result = await getNextLesson(TENANT, COMPANY, COURSE_ID, STUDENT);

      expect(result).toBeDefined();
    });
  });
});
