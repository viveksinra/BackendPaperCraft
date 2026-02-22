import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import { uploadRequestSchema, confirmUploadSchema } from "../../../shared/validation/courseValidation";
import * as courseUploadService from "../../../services/courseUploadService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const courseUploadV2Router = Router({ mergeParams: true });
courseUploadV2Router.use(ensureAuth, requireCompanyContext, ensureRole("teacher"));

// POST /companies/:companyId/courses/:courseId/upload/video
courseUploadV2Router.post("/upload/video", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = uploadRequestSchema.safeParse({ ...req.body, uploadType: "video" });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const { companyId, courseId } = req.params;
    const result = await courseUploadService.getPresignedUploadUrl({
      companyId, courseId, ...parsed.data,
    });
    return res.ok("upload URL generated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /companies/:companyId/courses/:courseId/upload/pdf
courseUploadV2Router.post("/upload/pdf", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = uploadRequestSchema.safeParse({ ...req.body, uploadType: "pdf" });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const { companyId, courseId } = req.params;
    const result = await courseUploadService.getPresignedUploadUrl({
      companyId, courseId, ...parsed.data,
    });
    return res.ok("upload URL generated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /companies/:companyId/courses/:courseId/upload/resource
courseUploadV2Router.post("/upload/resource", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = uploadRequestSchema.safeParse({ ...req.body, uploadType: "resource" });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const { companyId, courseId } = req.params;
    const result = await courseUploadService.getPresignedUploadUrl({
      companyId, courseId, ...parsed.data,
    });
    return res.ok("upload URL generated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /companies/:companyId/courses/:courseId/upload/thumbnail
courseUploadV2Router.post("/upload/thumbnail", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = uploadRequestSchema.safeParse({ ...req.body, uploadType: "thumbnail" });
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const { companyId, courseId } = req.params;
    const result = await courseUploadService.getPresignedUploadUrl({
      companyId, courseId, ...parsed.data,
    });
    return res.ok("upload URL generated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /companies/:companyId/courses/:courseId/upload/confirm
courseUploadV2Router.post("/upload/confirm", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = confirmUploadSchema.safeParse(req.body);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await courseUploadService.confirmUpload(parsed.data);
    return res.ok("upload confirmed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
