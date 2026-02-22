import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  generateReportSchema,
  bulkGenerateSchema,
} from "../../../shared/validation/reportValidation";
import * as reportService from "../../../services/reportService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const reportsV2Router = Router({ mergeParams: true });
reportsV2Router.use(ensureAuth, requireCompanyContext);

// POST /
reportsV2Router.post("/", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = generateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((i) => i.message).join(", "),
        "error"
      );
    }
    const tenantId = (req as any).tenantId || "";
    const email = (req as any).user?.email || "";
    const report = await reportService.generateReport(companyId, tenantId, parsed.data, email);
    return res.status(201).sendEnvelope("report generation queued", "success", report);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /
reportsV2Router.get("/", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { type, status, studentUserId, classId, page, pageSize } = req.query;
    const result = await reportService.listReports(
      companyId,
      {
        type: type as string,
        status: status as string,
        studentUserId: studentUserId as string,
        classId: classId as string,
      },
      {
        page: parseInt(page as string) || 1,
        pageSize: parseInt(pageSize as string) || 20,
      }
    );
    return res.ok("reports", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /:reportId
reportsV2Router.get("/:reportId", async (req: Request, res: Response) => {
  try {
    const { companyId, reportId } = req.params;
    const result = await reportService.getReport(companyId, reportId);
    return res.ok("report", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /:reportId/download
reportsV2Router.get("/:reportId/download", async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const result = await reportService.downloadReport(reportId);
    return res.ok("download url", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /bulk
reportsV2Router.post("/bulk", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = bulkGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((i) => i.message).join(", "),
        "error"
      );
    }
    const tenantId = (req as any).tenantId || "";
    const email = (req as any).user?.email || "";
    const result = await reportService.generateBulkClassReports(
      companyId,
      tenantId,
      parsed.data.classId,
      parsed.data.templateId,
      email
    );
    return res.status(201).sendEnvelope("bulk reports queued", "success", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /:reportId (admin only)
reportsV2Router.delete(
  "/:reportId",
  ensureRole("admin", "owner"),
  async (req: Request, res: Response) => {
    try {
      const { companyId, reportId } = req.params;
      await reportService.deleteReport(companyId, reportId);
      return res.ok("report deleted");
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
