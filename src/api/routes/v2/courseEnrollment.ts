import { Router, Request, Response } from "express";
import path from "path";
import { isStudent } from "../../../shared/middleware/roleGuards";
import {
  enrollSchema,
  rateSchema,
  trackTimeSchema,
  markLessonCompleteSchema,
  markLessonIncompleteSchema,
  updateCurrentLessonSchema,
} from "../../../shared/validation/courseValidation";
import * as enrollmentService from "../../../services/enrollmentService";
import * as courseProgressService from "../../../services/courseProgressService";
import { CourseEnrollmentModel } from "../../../models/courseEnrollment";
import { CourseModel } from "../../../models/course";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const courseEnrollmentV2Router = Router({ mergeParams: true });
courseEnrollmentV2Router.use(ensureAuth, isStudent);

async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

async function resolveCompanyId(req: AuthedRequest): Promise<string> {
  const userId = await resolveUserId(req);
  const user = await User.findById(userId).lean();
  const companyId = (user as any)?.companyId || (user as any)?.organizationId;
  if (!companyId) throw Object.assign(new Error("no company context"), { status: 400 });
  return companyId.toString();
}

// POST /api/v2/courses/:courseId/enroll
courseEnrollmentV2Router.post("/:courseId/enroll", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;
    const enrollment = await enrollmentService.enrollStudent({
      tenantId,
      companyId,
      courseId,
      studentUserId: parsed.data.studentUserId || userId,
      enrolledByUserId: userId,
      purchaseId: parsed.data.purchaseId,
    });
    return res.status(201).sendEnvelope("enrolled", "success", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/courses/my-enrollments
courseEnrollmentV2Router.get("/my-enrollments", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 12, 50);
    const status = req.query.status as string | undefined;
    const result = await enrollmentService.getStudentEnrollments(tenantId, companyId, userId, { page, pageSize: limit, status });
    return res.ok("enrollments", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/courses/:courseId/progress
courseEnrollmentV2Router.get("/:courseId/progress", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;
    const enrollment = await enrollmentService.getEnrollment(tenantId, companyId, courseId, userId);
    if (!enrollment) {
      return res.status(404).sendEnvelope("enrollment not found", "error");
    }
    const nextLesson = await courseProgressService.getNextLesson(tenantId, companyId, courseId, userId);
    return res.ok("progress", { enrollment, nextLesson });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/courses/:courseId/lessons/:lessonId/complete
courseEnrollmentV2Router.post("/:courseId/lessons/:lessonId/complete", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = markLessonCompleteSchema.safeParse({ ...req.body, lessonId: req.params.lessonId });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;
    const enrollment = await courseProgressService.markLessonComplete({
      tenantId, companyId, courseId, studentUserId: userId,
      lessonId: parsed.data.lessonId, sectionId: parsed.data.sectionId,
      quizScore: parsed.data.quizScore,
    });
    return res.ok("lesson completed", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/courses/:courseId/lessons/:lessonId/incomplete
courseEnrollmentV2Router.post("/:courseId/lessons/:lessonId/incomplete", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId, lessonId } = req.params;
    const enrollment = await courseProgressService.markLessonIncomplete({
      tenantId, companyId, courseId, studentUserId: userId, lessonId,
    });
    return res.ok("lesson unmarked", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/courses/:courseId/lessons/:lessonId/track-time
courseEnrollmentV2Router.post("/:courseId/lessons/:lessonId/track-time", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = trackTimeSchema.safeParse({ ...req.body, lessonId: req.params.lessonId });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;
    const enrollment = await courseProgressService.trackTimeSpent({
      tenantId, companyId, courseId, studentUserId: userId,
      lessonId: parsed.data.lessonId, additionalSeconds: parsed.data.additionalSeconds,
    });
    return res.ok("time tracked", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/courses/:courseId/lessons/:lessonId/content
courseEnrollmentV2Router.get("/:courseId/lessons/:lessonId/content", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId, lessonId } = req.params;

    const course = await CourseModel.findOne({ _id: courseId, tenantId, companyId });
    if (!course) return res.status(404).sendEnvelope("course not found", "error");

    let lesson: any = null;
    let sectionTitle = "";
    for (const section of course.sections) {
      const found = section.lessons.find((l) => String(l._id) === lessonId);
      if (found) { lesson = found; sectionTitle = section.title; break; }
    }
    if (!lesson) return res.status(404).sendEnvelope("lesson not found", "error");

    // Check drip date
    if (lesson.dripDate && new Date(lesson.dripDate) > new Date()) {
      return res.ok("lesson locked", { locked: true, availableAt: lesson.dripDate, title: lesson.title });
    }

    // Free lessons are accessible to all
    if (!lesson.isFree) {
      const enrolled = await enrollmentService.isEnrolled(tenantId, companyId, courseId, userId);
      if (!enrolled) {
        return res.status(403).sendEnvelope("enrollment required", "error");
      }
    }

    // Update current lesson position
    for (const section of course.sections) {
      if (section.lessons.find((l) => String(l._id) === lessonId)) {
        await courseProgressService.updateCurrentLesson({
          tenantId, companyId, courseId, studentUserId: userId,
          sectionId: String(section._id), lessonId,
        }).catch(() => {});
        break;
      }
    }

    return res.ok("lesson content", {
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        content: lesson.content,
        estimatedMinutes: lesson.estimatedMinutes,
        sectionTitle,
      },
    });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/courses/:courseId/rate
courseEnrollmentV2Router.post("/:courseId/rate", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;

    const enrollment = await enrollmentService.getEnrollment(tenantId, companyId, courseId, userId);
    if (!enrollment) return res.status(404).sendEnvelope("enrollment not found", "error");

    enrollment.review = {
      rating: parsed.data.rating,
      reviewText: parsed.data.reviewText || "",
      reviewedAt: new Date(),
      isVisible: true,
    };
    await enrollment.save();

    // Queue stats update
    try {
      const { addCourseStatsUpdateJob } = await import("../../../queue/queues");
      await addCourseStatsUpdateJob({ tenantId, companyId, courseId });
    } catch {}

    return res.ok("review submitted", { review: enrollment.review });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/courses/:courseId/rate
courseEnrollmentV2Router.patch("/:courseId/rate", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;

    const enrollment = await enrollmentService.getEnrollment(tenantId, companyId, courseId, userId);
    if (!enrollment) return res.status(404).sendEnvelope("enrollment not found", "error");
    if (!enrollment.review) return res.status(400).sendEnvelope("no review to update", "error");

    enrollment.review.rating = parsed.data.rating;
    if (parsed.data.reviewText !== undefined) enrollment.review.reviewText = parsed.data.reviewText;
    enrollment.review.reviewedAt = new Date();
    await enrollment.save();

    return res.ok("review updated", { review: enrollment.review });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/courses/:courseId/drop
courseEnrollmentV2Router.post("/:courseId/drop", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req);
    const { courseId } = req.params;
    const enrollment = await enrollmentService.dropEnrollment(tenantId, companyId, courseId, userId);
    return res.ok("enrollment dropped", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
