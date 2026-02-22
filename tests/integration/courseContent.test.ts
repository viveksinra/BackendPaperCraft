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

// Mock ensureRole
vi.mock("../../src/shared/middleware/ensureRole", () => ({
  ensureRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/courseValidation", () => ({
  addSectionSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateSectionSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  reorderSectionsSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  addLessonSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateLessonSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  reorderLessonsSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  moveLessonSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  setVideoContentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  setPdfContentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  setTextContentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  setQuizContentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  setResourceContentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  createCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  updateCourseSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  browseCatalogSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

// Mock courseContentService
const mockAddSection = vi.fn();
const mockUpdateSection = vi.fn();
const mockDeleteSection = vi.fn();
const mockReorderSections = vi.fn();
const mockAddLesson = vi.fn();
const mockUpdateLesson = vi.fn();
const mockDeleteLesson = vi.fn();
const mockReorderLessons = vi.fn();
const mockMoveLessonToSection = vi.fn();
const mockSetLessonVideoContent = vi.fn();
const mockSetLessonPdfContent = vi.fn();
const mockSetLessonTextContent = vi.fn();
const mockSetLessonQuizContent = vi.fn();
const mockSetLessonResourceContent = vi.fn();

vi.mock("../../src/services/courseContentService", () => ({
  addSection: (...args: unknown[]) => mockAddSection(...args),
  updateSection: (...args: unknown[]) => mockUpdateSection(...args),
  deleteSection: (...args: unknown[]) => mockDeleteSection(...args),
  reorderSections: (...args: unknown[]) => mockReorderSections(...args),
  addLesson: (...args: unknown[]) => mockAddLesson(...args),
  updateLesson: (...args: unknown[]) => mockUpdateLesson(...args),
  deleteLesson: (...args: unknown[]) => mockDeleteLesson(...args),
  reorderLessons: (...args: unknown[]) => mockReorderLessons(...args),
  moveLessonToSection: (...args: unknown[]) => mockMoveLessonToSection(...args),
  setLessonVideoContent: (...args: unknown[]) => mockSetLessonVideoContent(...args),
  setLessonPdfContent: (...args: unknown[]) => mockSetLessonPdfContent(...args),
  setLessonTextContent: (...args: unknown[]) => mockSetLessonTextContent(...args),
  setLessonQuizContent: (...args: unknown[]) => mockSetLessonQuizContent(...args),
  setLessonResourceContent: (...args: unknown[]) => mockSetLessonResourceContent(...args),
}));

vi.mock("../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const COURSE_ID = new mongoose.Types.ObjectId().toString();
const SECTION_ID = new mongoose.Types.ObjectId().toString();
const LESSON_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/courses/${COURSE_ID}`;

let app: ReturnType<typeof buildApp>;

describe("Course Content API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Sections ──────────────────────────────────────────────────

  describe("POST /sections", () => {
    it("adds a section to course", async () => {
      const course = { _id: COURSE_ID, sections: [{ title: "New Section" }] };
      mockAddSection.mockResolvedValue(course);

      const res = await request(app)
        .post(`${BASE}/sections`)
        .send({ title: "New Section" })
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(mockAddSection).toHaveBeenCalledWith(
        "testTenant", COMPANY_ID, COURSE_ID, "New Section", "teacher@test.com"
      );
    });
  });

  describe("DELETE /sections/:sectionId", () => {
    it("deletes a section", async () => {
      mockDeleteSection.mockResolvedValue({ _id: COURSE_ID, sections: [] });

      const res = await request(app)
        .delete(`${BASE}/sections/${SECTION_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteSection).toHaveBeenCalled();
    });
  });

  describe("PUT /sections/reorder", () => {
    it("reorders sections", async () => {
      const s1 = new mongoose.Types.ObjectId().toString();
      const s2 = new mongoose.Types.ObjectId().toString();
      mockReorderSections.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .put(`${BASE}/sections/reorder`)
        .send({ sectionOrder: [s2, s1] })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockReorderSections).toHaveBeenCalled();
    });
  });

  // ─── Lessons ───────────────────────────────────────────────────

  describe("POST /sections/:sectionId/lessons", () => {
    it("adds a lesson to section", async () => {
      mockAddLesson.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .post(`${BASE}/sections/${SECTION_ID}/lessons`)
        .send({ title: "New Lesson", type: "text" })
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(mockAddLesson).toHaveBeenCalled();
    });
  });

  describe("DELETE /sections/:sectionId/lessons/:lessonId", () => {
    it("deletes a lesson", async () => {
      mockDeleteLesson.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .delete(`${BASE}/sections/${SECTION_ID}/lessons/${LESSON_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteLesson).toHaveBeenCalled();
    });
  });

  describe("PUT /sections/:sectionId/lessons/reorder", () => {
    it("reorders lessons within section", async () => {
      const l1 = new mongoose.Types.ObjectId().toString();
      const l2 = new mongoose.Types.ObjectId().toString();
      mockReorderLessons.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .put(`${BASE}/sections/${SECTION_ID}/lessons/reorder`)
        .send({ lessonOrder: [l2, l1] })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockReorderLessons).toHaveBeenCalled();
    });
  });

  // ─── Content ───────────────────────────────────────────────────

  describe("PUT /sections/:sectionId/lessons/:lessonId/content", () => {
    it("sets video content", async () => {
      mockSetLessonVideoContent.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .put(`${BASE}/sections/${SECTION_ID}/lessons/${LESSON_ID}/content`)
        .send({
          contentType: "video",
          videoUrl: "https://cdn.example.com/v.mp4",
          durationMinutes: 15,
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockSetLessonVideoContent).toHaveBeenCalled();
    });

    it("sets quiz content", async () => {
      mockSetLessonQuizContent.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .put(`${BASE}/sections/${SECTION_ID}/lessons/${LESSON_ID}/content`)
        .send({
          contentType: "quiz",
          testId: new mongoose.Types.ObjectId().toString(),
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockSetLessonQuizContent).toHaveBeenCalled();
    });

    it("rejects invalid contentType", async () => {
      const res = await request(app)
        .put(`${BASE}/sections/${SECTION_ID}/lessons/${LESSON_ID}/content`)
        .send({ contentType: "invalid" })
        .expect(400);

      expect(res.body.variant).toBe("error");
    });

    it("returns error for cross-company quiz", async () => {
      mockSetLessonQuizContent.mockRejectedValue(
        Object.assign(new Error("quiz does not belong to this company"), { status: 400 })
      );

      const res = await request(app)
        .put(`${BASE}/sections/${SECTION_ID}/lessons/${LESSON_ID}/content`)
        .send({
          contentType: "quiz",
          testId: new mongoose.Types.ObjectId().toString(),
        })
        .expect(400);

      expect(res.body.variant).toBe("error");
    });
  });

  // ─── Move ──────────────────────────────────────────────────────

  describe("PUT /lessons/:lessonId/move", () => {
    it("moves lesson between sections", async () => {
      const toSection = new mongoose.Types.ObjectId().toString();
      mockMoveLessonToSection.mockResolvedValue({ _id: COURSE_ID });

      const res = await request(app)
        .put(`${BASE}/lessons/${LESSON_ID}/move`)
        .send({
          fromSectionId: SECTION_ID,
          toSectionId: toSection,
          newOrder: 0,
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockMoveLessonToSection).toHaveBeenCalled();
    });
  });
});
