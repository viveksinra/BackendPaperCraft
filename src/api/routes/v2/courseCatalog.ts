import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { browseCatalogSchema } from "../../../shared/validation/courseValidation";
import * as courseService from "../../../services/courseService";
import { CourseEnrollmentModel } from "../../../models/courseEnrollment";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const courseCatalogV2Router = Router({ mergeParams: true });
courseCatalogV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/catalog/courses
courseCatalogV2Router.get("/courses", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = browseCatalogSchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const catalogParams = {
      ...parsed.data,
      isFree: parsed.data.isFree === "true" ? true : parsed.data.isFree === "false" ? false : undefined,
    };
    const result = await courseService.browseCatalog(tenantId, companyId, catalogParams);
    return res.ok("catalog", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/catalog/courses/:courseSlugOrId
courseCatalogV2Router.get("/courses/:courseSlugOrId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseSlugOrId } = req.params;
    const course = await courseService.getCourseDetail(tenantId, companyId, courseSlugOrId);
    return res.ok("course detail", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/catalog/courses/:courseId/reviews
courseCatalogV2Router.get("/courses/:courseId/reviews", async (req: AuthedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      CourseEnrollmentModel.find(
        { courseId, review: { $ne: null }, "review.isVisible": true },
        { review: 1, studentUserId: 1 }
      )
        .sort({ "review.reviewedAt": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CourseEnrollmentModel.countDocuments({
        courseId, review: { $ne: null }, "review.isVisible": true,
      }),
    ]);

    return res.ok("reviews", {
      reviews: reviews.map((e) => ({ ...e.review, studentUserId: e.studentUserId })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
