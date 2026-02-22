import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createSubjectSchema,
  updateSubjectSchema,
  moveSubjectSchema,
  reorderSubjectsSchema,
} from "../../../shared/validation/subjectValidation";
import * as subjectService from "../../../services/subjectService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const subjectsV2Router = Router({ mergeParams: true });
subjectsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/subjects
subjectsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const subjects = await subjectService.getSubjectTree(companyId);
    return res.ok("subjects", { subjects });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/subjects
subjectsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const subject = await subjectService.createSubject(companyId, tenantId, parsed.data, userEmail);
    return res.ok("subject created", { subject });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/subjects/reorder — before /:subjectId
subjectsV2Router.patch("/reorder", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = reorderSubjectsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    await subjectService.reorderSubjects(companyId, parsed.data.parentId, parsed.data.orderedIds);
    return res.ok("subjects reordered");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/subjects/:subjectId
subjectsV2Router.get("/:subjectId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, subjectId } = req.params;
    const subject = await subjectService.getSubjectById(companyId, subjectId);
    return res.ok("subject", { subject });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/subjects/:subjectId
subjectsV2Router.patch("/:subjectId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, subjectId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const subject = await subjectService.updateSubject(companyId, subjectId, parsed.data, userEmail);
    return res.ok("subject updated", { subject });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/subjects/:subjectId
subjectsV2Router.delete("/:subjectId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, subjectId } = req.params;
    await subjectService.deleteSubject(companyId, subjectId);
    return res.ok("subject deactivated");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/subjects/:subjectId/move
subjectsV2Router.patch("/:subjectId/move", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = moveSubjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, subjectId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const subject = await subjectService.moveSubject(
      companyId, subjectId, parsed.data.newParentId, parsed.data.newSortOrder, userEmail
    );
    return res.ok("subject moved", { subject });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
