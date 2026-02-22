import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  createCourseSchema,
  updateCourseSchema,
} from "../../../shared/validation/courseValidation";
import * as courseService from "../../../services/courseService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const coursesV2Router = Router({ mergeParams: true });
coursesV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/courses
coursesV2Router.get("/", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const { status, teacherId, category, search, page, limit, sortBy } = req.query as Record<string, string>;
    const result = await courseService.listCourses(tenantId, companyId, {
      status: status as any,
      teacherId,
      category,
      search,
      page: page ? Number(page) : undefined,
      pageSize: limit ? Number(limit) : undefined,
      sortBy: sortBy as any,
    });
    return res.ok("courses", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/courses
coursesV2Router.post("/", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseService.createCourse(tenantId, companyId, parsed.data, userEmail);
    return res.status(201).sendEnvelope("course created", "success", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/courses/:courseId
coursesV2Router.get("/:courseId", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const course = await courseService.getCourseById(tenantId, companyId, courseId);
    return res.ok("course", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/courses/:courseId
coursesV2Router.patch("/:courseId", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseService.updateCourse(tenantId, companyId, courseId, parsed.data, userEmail);
    return res.ok("course updated", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/courses/:courseId
coursesV2Router.delete("/:courseId", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    await courseService.deleteCourse(tenantId, companyId, courseId);
    return res.ok("course deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/courses/:courseId/publish
coursesV2Router.post("/:courseId/publish", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseService.publishCourse(tenantId, companyId, courseId, userEmail);
    return res.ok("course published", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/courses/:courseId/unpublish
coursesV2Router.post("/:courseId/unpublish", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseService.unpublishCourse(tenantId, companyId, courseId, userEmail);
    return res.ok("course unpublished", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/courses/:courseId/archive
coursesV2Router.post("/:courseId/archive", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const course = await courseService.archiveCourse(tenantId, companyId, courseId, userEmail);
    return res.ok("course archived", { course });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/courses/:courseId/duplicate
coursesV2Router.post("/:courseId/duplicate", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, courseId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const newCourse = await courseService.duplicateCourse(tenantId, companyId, courseId, userEmail);
    return res.status(201).sendEnvelope("course duplicated", "success", { course: newCourse });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
