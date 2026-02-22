import { Router, Request, Response } from "express";
import path from "path";
import { isStudent } from "../../../shared/middleware/roleGuards";
import * as certificateService from "../../../services/certificateService";
import { CourseEnrollmentModel } from "../../../models/courseEnrollment";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const certificatesV2Router = Router({ mergeParams: true });

async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// GET /api/v2/certificates/verify/:certificateNumber -- PUBLIC
certificatesV2Router.get("/verify/:certificateNumber", async (req: Request, res: Response) => {
  try {
    const { certificateNumber } = req.params;
    const result = await certificateService.verifyCertificate(certificateNumber);
    if (!result) {
      return res.status(404).sendEnvelope("certificate not found", "error");
    }
    return res.ok("certificate verified", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// Apply auth for remaining routes
certificatesV2Router.use(ensureAuth, isStudent);

// GET /api/v2/certificates/my-certificates
certificatesV2Router.get("/my-certificates", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const enrollments = await CourseEnrollmentModel.find({
      studentUserId: userId,
      "certificate.issued": true,
    })
      .select("courseId certificate")
      .sort({ "certificate.issuedAt": -1 })
      .lean();

    return res.ok("certificates", { certificates: enrollments });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/courses/:courseId/certificate
certificatesV2Router.get("/courses/:courseId/certificate", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const { courseId } = req.params;
    const enrollment = await CourseEnrollmentModel.findOne({
      courseId, studentUserId: userId, "certificate.issued": true,
    }).lean();

    if (!enrollment) {
      return res.status(404).sendEnvelope("certificate not found", "error");
    }
    return res.ok("certificate", { certificate: enrollment.certificate });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/courses/:courseId/certificate/download
certificatesV2Router.get("/courses/:courseId/certificate/download", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const userId = await resolveUserId(req);
    const { courseId } = req.params;

    const enrollment = await CourseEnrollmentModel.findOne({
      courseId, studentUserId: userId, "certificate.issued": true,
    });
    if (!enrollment) {
      return res.status(404).sendEnvelope("certificate not found", "error");
    }

    const companyId = enrollment.companyId.toString();
    const downloadUrl = await certificateService.getCertificateDownloadUrl(
      tenantId, companyId, String(enrollment._id), userId
    );
    return res.ok("download URL", { downloadUrl });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
