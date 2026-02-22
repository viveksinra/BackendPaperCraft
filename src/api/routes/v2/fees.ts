import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  updateFeeSchema,
  bulkUpdateFeesSchema,
  sendReminderSchema,
} from "../../../shared/validation/feeValidation";
import * as feeService from "../../../services/feeService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const feesV2Router = Router({ mergeParams: true });
feesV2Router.use(ensureAuth, requireCompanyContext);

// ─── GET / — Get fee status per class ───────────────────────────────────────

feesV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const classId = req.query.classId as string;
    if (!classId) {
      return res.status(400).sendEnvelope("classId query parameter required", "error");
    }
    const result = await feeService.getClassFees(
      companyId,
      classId,
      { status: req.query.status as string },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
      }
    );
    return res.ok("class fees", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /bulk — Bulk set fee amount ──────────────────────────────────────
// NOTE: Must be registered before /:studentId to avoid param conflict

feesV2Router.patch("/bulk", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = bulkUpdateFeesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const result = await feeService.bulkUpdateFees(
      companyId,
      parsed.data.classId,
      {
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        dueDate: parsed.data.dueDate,
      },
      userEmail
    );
    return res.ok("fees bulk updated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /:studentId — Update fee for student ─────────────────────────────

feesV2Router.patch("/:studentId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId, studentId } = req.params;
    const classId = req.query.classId as string;
    if (!classId) {
      return res.status(400).sendEnvelope("classId query parameter required", "error");
    }
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const fee = await feeService.updateFeeStatus(
      companyId,
      classId,
      studentId,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("fee updated", { fee });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST /send-reminder — Send payment reminder ───────────────────────────

feesV2Router.post("/send-reminder", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = sendReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const result = await feeService.sendFeeReminder(
      companyId,
      parsed.data.classId,
      parsed.data.studentUserIds,
      userEmail
    );
    return res.ok("reminders sent", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
