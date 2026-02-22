import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  gradeSubmissionSchema,
} from "../../../shared/validation/homeworkValidation";
import * as homeworkService from "../../../services/homeworkService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const homeworkV2Router = Router({ mergeParams: true });
homeworkV2Router.use(ensureAuth, requireCompanyContext);

// ─── GET / — List homework ─────────────────────────────────────────────────

homeworkV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await homeworkService.listHomework(
      companyId,
      {
        classId: req.query.classId as string,
        status: req.query.status as string,
        dueDateFrom: req.query.dueDateFrom as string,
        dueDateTo: req.query.dueDateTo as string,
      },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        sortBy: (req.query.sortBy as string) || "dueDate",
        sortDir: (req.query.sortDir as string) === "asc" ? "asc" : "desc",
      }
    );
    return res.ok("homework listed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST / — Create homework ──────────────────────────────────────────────

homeworkV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createHomeworkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const hw = await homeworkService.createHomework(
      companyId,
      tenantId,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("homework created", { homework: hw });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── GET /:id — Get homework detail ─────────────────────────────────────────

homeworkV2Router.get("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const hw = await homeworkService.getHomework(companyId, id);
    return res.ok("homework detail", { homework: hw });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /:id — Update homework ──────────────────────────────────────────

homeworkV2Router.patch("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateHomeworkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const hw = await homeworkService.updateHomework(
      companyId,
      id,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("homework updated", { homework: hw });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── DELETE /:id — Archive homework ─────────────────────────────────────────

homeworkV2Router.delete("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const hw = await homeworkService.deleteHomework(companyId, id);
    return res.ok("homework archived", { homework: hw });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── GET /:id/submissions — List submissions ───────────────────────────────

homeworkV2Router.get("/:id/submissions", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const result = await homeworkService.getHomeworkSubmissions(
      companyId,
      id,
      { status: req.query.status as string },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
      }
    );
    return res.ok("submissions listed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /:id/submissions/:studentId/grade — Grade submission ────────────

homeworkV2Router.patch(
  "/:id/submissions/:studentId/grade",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = gradeSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).sendEnvelope(
          parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
          "error"
        );
      }
      const { companyId, id, studentId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const submission = await homeworkService.gradeHomeworkSubmission(
        companyId,
        id,
        studentId,
        parsed.data.grades,
        parsed.data.feedback,
        userEmail
      );
      return res.ok("submission graded", { submission });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
