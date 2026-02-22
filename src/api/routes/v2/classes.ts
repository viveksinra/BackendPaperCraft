import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createClassSchema,
  updateClassSchema,
  addStudentsSchema,
  addTeacherSchema,
} from "../../../shared/validation/classValidation";
import * as classService from "../../../services/classService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const classesV2Router = Router({ mergeParams: true });
classesV2Router.use(ensureAuth, requireCompanyContext);

// ─── GET / — List classes ───────────────────────────────────────────────────

classesV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const result = await classService.listClasses(
      companyId,
      tenantId,
      {
        status: req.query.status as string,
        yearGroup: req.query.yearGroup as string,
        subject: req.query.subject as string,
        teacherId: req.query.teacherId as string,
      },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortDir: (req.query.sortDir as string) === "asc" ? "asc" : "desc",
      }
    );
    return res.ok("classes listed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST / — Create class ──────────────────────────────────────────────────

classesV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createClassSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const cls = await classService.createClass(
      companyId,
      tenantId,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("class created", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── GET /:id — Get class detail ────────────────────────────────────────────

classesV2Router.get("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const cls = await classService.getClass(companyId, id);
    return res.ok("class detail", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /:id — Update class ──────────────────────────────────────────────

classesV2Router.patch("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const cls = await classService.updateClass(
      companyId,
      id,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("class updated", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── DELETE /:id — Archive class ────────────────────────────────────────────

classesV2Router.delete("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const cls = await classService.deleteClass(companyId, id);
    return res.ok("class archived", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── GET /:id/students — List class students ────────────────────────────────

classesV2Router.get("/:id/students", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const result = await classService.getClassStudents(companyId, id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    return res.ok("class students", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST /:id/students — Add students ──────────────────────────────────────

classesV2Router.post("/:id/students", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addStudentsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const cls = await classService.addStudents(
      companyId,
      id,
      parsed.data.studentUserIds,
      userEmail
    );
    return res.ok("students added", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── DELETE /:id/students/:studentId — Remove student ───────────────────────

classesV2Router.delete(
  "/:id/students/:studentId",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, id, studentId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const cls = await classService.removeStudent(
        companyId,
        id,
        studentId,
        userEmail
      );
      return res.ok("student removed", { class: cls });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── POST /:id/teachers — Add teacher ───────────────────────────────────────

classesV2Router.post("/:id/teachers", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const cls = await classService.addTeacher(
      companyId,
      id,
      parsed.data.teacherUserId,
      userEmail
    );
    return res.ok("teacher added", { class: cls });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── DELETE /:id/teachers/:teacherId — Remove teacher ───────────────────────

classesV2Router.delete(
  "/:id/teachers/:teacherId",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, id, teacherId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const cls = await classService.removeTeacher(
        companyId,
        id,
        teacherId,
        userEmail
      );
      return res.ok("teacher removed", { class: cls });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── GET /:id/performance — Class performance ──────────────────────────────

classesV2Router.get("/:id/performance", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const perf = await classService.getClassPerformance(companyId, id);
    return res.ok("class performance", perf);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
