import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import * as courseAnalyticsService from "../../../services/courseAnalyticsService";
import * as enrollmentService from "../../../services/enrollmentService";
import { CourseEnrollmentModel } from "../../../models/courseEnrollment";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const courseAnalyticsV2Router = Router({ mergeParams: true });
courseAnalyticsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/courses/:courseId/analytics
courseAnalyticsV2Router.get("/:courseId/analytics", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const analytics = await courseAnalyticsService.getCourseAnalytics(tenantId, companyId, courseId);
    return res.ok("course analytics", analytics);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/courses/:courseId/analytics/enrollments
courseAnalyticsV2Router.get("/:courseId/analytics/enrollments", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const search = (req.query.search as string) || "";
    const sortBy = (req.query.sortBy as string) || "enrolledAt";
    const result = await enrollmentService.getCourseEnrollments(tenantId, companyId, courseId, { page, pageSize: limit, search, sortBy });
    return res.ok("course enrollments", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/courses/:courseId/analytics/funnel
courseAnalyticsV2Router.get("/:courseId/analytics/funnel", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const analytics = await courseAnalyticsService.getCourseAnalytics(tenantId, companyId, courseId);
    return res.ok("completion funnel", { completionFunnel: analytics.completionFunnel });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/courses/:courseId/analytics/lessons/:lessonId
courseAnalyticsV2Router.get("/:courseId/analytics/lessons/:lessonId", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId, lessonId } = req.params;
    const analytics = await courseAnalyticsService.getLessonAnalytics(tenantId, companyId, courseId, lessonId);
    return res.ok("lesson analytics", analytics);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/courses/:courseId/analytics/reviews
courseAnalyticsV2Router.get("/:courseId/analytics/reviews", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      CourseEnrollmentModel.find(
        { courseId, review: { $ne: null } },
        { review: 1, studentUserId: 1, _id: 1 }
      )
        .sort({ "review.reviewedAt": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CourseEnrollmentModel.countDocuments({ courseId, review: { $ne: null } }),
    ]);

    return res.ok("reviews", {
      reviews: reviews.map((e) => ({
        enrollmentId: String(e._id),
        studentUserId: e.studentUserId,
        ...e.review,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/courses/:courseId/reviews/:enrollmentId/visibility
courseAnalyticsV2Router.patch("/:courseId/reviews/:enrollmentId/visibility", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const { enrollmentId } = req.params;
    const { isVisible } = req.body;
    if (typeof isVisible !== "boolean") {
      return res.fail("isVisible must be a boolean");
    }
    const enrollment = await CourseEnrollmentModel.findById(enrollmentId);
    if (!enrollment || !enrollment.review) {
      return res.status(404).sendEnvelope("review not found", "error");
    }
    enrollment.review.isVisible = isVisible;
    await enrollment.save();
    return res.ok("review visibility updated", { review: enrollment.review });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/analytics/courses -- institute-level
courseAnalyticsV2Router.get("/", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const analytics = await courseAnalyticsService.getInstituteCourseAnalytics(tenantId, companyId);
    return res.ok("institute course analytics", analytics);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
