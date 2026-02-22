import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  addSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  addLessonSchema,
  updateLessonSchema,
  reorderLessonsSchema,
  moveLessonSchema,
  setVideoContentSchema,
  setPdfContentSchema,
  setTextContentSchema,
  setQuizContentSchema,
  setResourceContentSchema,
} from "../../../shared/validation/courseValidation";
import * as courseContentService from "../../../services/courseContentService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const courseContentV2Router = Router({ mergeParams: true });
courseContentV2Router.use(ensureAuth, requireCompanyContext, ensureRole("teacher"));

// POST /companies/:companyId/courses/:courseId/sections
courseContentV2Router.post("/sections", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addSectionSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.addSection(tenantId, companyId, courseId, parsed.data.title, userEmail);
    return res.status(201).sendEnvelope("section added", "success", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /companies/:companyId/courses/:courseId/sections/:sectionId
courseContentV2Router.patch("/sections/:sectionId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.updateSection(tenantId, companyId, courseId, sectionId, parsed.data.title, userEmail);
    return res.ok("section updated", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /companies/:companyId/courses/:courseId/sections/:sectionId
courseContentV2Router.delete("/sections/:sectionId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.deleteSection(tenantId, companyId, courseId, sectionId, userEmail);
    return res.ok("section deleted", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /companies/:companyId/courses/:courseId/sections/reorder
courseContentV2Router.put("/sections/reorder", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = reorderSectionsSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.reorderSections(tenantId, companyId, courseId, parsed.data.sectionOrder, userEmail);
    return res.ok("sections reordered", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /companies/:companyId/courses/:courseId/sections/:sectionId/lessons
courseContentV2Router.post("/sections/:sectionId/lessons", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addLessonSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.addLesson(tenantId, companyId, courseId, sectionId, parsed.data, userEmail);
    return res.status(201).sendEnvelope("lesson added", "success", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /companies/:companyId/courses/:courseId/sections/:sectionId/lessons/:lessonId
courseContentV2Router.patch("/sections/:sectionId/lessons/:lessonId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateLessonSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId, lessonId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.updateLesson(tenantId, companyId, courseId, sectionId, lessonId, parsed.data, userEmail);
    return res.ok("lesson updated", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /companies/:companyId/courses/:courseId/sections/:sectionId/lessons/:lessonId
courseContentV2Router.delete("/sections/:sectionId/lessons/:lessonId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId, lessonId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.deleteLesson(tenantId, companyId, courseId, sectionId, lessonId, userEmail);
    return res.ok("lesson deleted", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /companies/:companyId/courses/:courseId/sections/:sectionId/lessons/reorder
courseContentV2Router.put("/sections/:sectionId/lessons/reorder", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = reorderLessonsSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.reorderLessons(tenantId, companyId, courseId, sectionId, parsed.data.lessonOrder, userEmail);
    return res.ok("lessons reordered", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /companies/:companyId/courses/:courseId/lessons/:lessonId/move
courseContentV2Router.put("/lessons/:lessonId/move", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = moveLessonSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, lessonId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseContentService.moveLessonToSection(
      tenantId, companyId, courseId, lessonId,
      parsed.data.fromSectionId, parsed.data.toSectionId, parsed.data.newOrder, userEmail
    );
    return res.ok("lesson moved", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /companies/:companyId/courses/:courseId/sections/:sectionId/lessons/:lessonId/content
courseContentV2Router.put("/sections/:sectionId/lessons/:lessonId/content", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, sectionId, lessonId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const { contentType } = req.body;

    let course;
    switch (contentType) {
      case "video": {
        const parsed = setVideoContentSchema.safeParse(req.body);
        if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
        course = await courseContentService.setLessonVideoContent(tenantId, companyId, courseId, sectionId, lessonId, parsed.data, userEmail);
        break;
      }
      case "pdf": {
        const parsed = setPdfContentSchema.safeParse(req.body);
        if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
        course = await courseContentService.setLessonPdfContent(tenantId, companyId, courseId, sectionId, lessonId, parsed.data, userEmail);
        break;
      }
      case "text": {
        const parsed = setTextContentSchema.safeParse(req.body);
        if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
        course = await courseContentService.setLessonTextContent(tenantId, companyId, courseId, sectionId, lessonId, parsed.data.textContent, userEmail);
        break;
      }
      case "quiz": {
        const parsed = setQuizContentSchema.safeParse(req.body);
        if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
        course = await courseContentService.setLessonQuizContent(tenantId, companyId, courseId, sectionId, lessonId, parsed.data.testId, userEmail);
        break;
      }
      case "resource": {
        const parsed = setResourceContentSchema.safeParse(req.body);
        if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
        course = await courseContentService.setLessonResourceContent(tenantId, companyId, courseId, sectionId, lessonId, parsed.data.resourceFiles, userEmail);
        break;
      }
      default:
        return res.fail("Invalid contentType. Must be: video, pdf, text, quiz, resource");
    }
    return res.ok("lesson content updated", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
