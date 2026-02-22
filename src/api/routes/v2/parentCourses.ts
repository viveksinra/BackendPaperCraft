import { Router, Request, Response } from "express";
import path from "path";
import { isParent, isParentOf } from "../../../shared/middleware/roleGuards";
import * as enrollmentService from "../../../services/enrollmentService";
import { CourseEnrollmentModel } from "../../../models/courseEnrollment";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string }; parentLink?: any };

export const parentCoursesV2Router = Router();
parentCoursesV2Router.use(ensureAuth);

async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// GET /api/v2/parent/children/:childId/courses
parentCoursesV2Router.get("/children/:childId/courses", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { childId } = req.params;
    const child = await User.findById(childId).lean();
    const companyId = (child as any)?.companyId || (child as any)?.organizationId;
    if (!companyId) return res.status(400).sendEnvelope("child has no company", "error");

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 12, 50);
    const result = await enrollmentService.getStudentEnrollments(tenantId, companyId.toString(), childId, { page, pageSize: limit });
    return res.ok("child courses", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/parent/children/:childId/courses/:courseId/progress
parentCoursesV2Router.get("/children/:childId/courses/:courseId/progress", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { childId, courseId } = req.params;
    const child = await User.findById(childId).lean();
    const companyId = (child as any)?.companyId || (child as any)?.organizationId;
    if (!companyId) return res.status(400).sendEnvelope("child has no company", "error");

    const enrollment = await enrollmentService.getEnrollment(tenantId, companyId.toString(), courseId, childId);
    if (!enrollment) return res.status(404).sendEnvelope("enrollment not found", "error");
    return res.ok("child course progress", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/parent/children/:childId/courses/:courseId/enroll
parentCoursesV2Router.post("/children/:childId/courses/:courseId/enroll", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const parentUserId = await resolveUserId(req);
    const { childId, courseId } = req.params;
    const child = await User.findById(childId).lean();
    const companyId = (child as any)?.companyId || (child as any)?.organizationId;
    if (!companyId) return res.status(400).sendEnvelope("child has no company", "error");

    const enrollment = await enrollmentService.enrollStudent({
      tenantId,
      companyId: companyId.toString(),
      courseId,
      studentUserId: childId,
      enrolledByUserId: parentUserId,
      purchaseId: req.body.purchaseId,
    });
    return res.status(201).sendEnvelope("child enrolled", "success", { enrollment });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/parent/children/:childId/certificates
parentCoursesV2Router.get("/children/:childId/certificates", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const { childId } = req.params;
    const enrollments = await CourseEnrollmentModel.find({
      studentUserId: childId,
      "certificate.issued": true,
    })
      .select("courseId certificate")
      .sort({ "certificate.issuedAt": -1 })
      .lean();

    return res.ok("child certificates", { certificates: enrollments });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
