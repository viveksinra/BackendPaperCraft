import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import { analyticsQuerySchema } from "../../../shared/validation/analyticsValidation";
import * as instituteAnalyticsService from "../../../services/instituteAnalyticsService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const instituteAnalyticsV2Router = Router({ mergeParams: true });
instituteAnalyticsV2Router.use(ensureAuth, requireCompanyContext, ensureRole("admin", "owner"));

// GET /overview
instituteAnalyticsV2Router.get("/overview", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await instituteAnalyticsService.getInstituteOverview(companyId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    return res.ok("institute overview", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /enrollment-trends
instituteAnalyticsV2Router.get("/enrollment-trends", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await instituteAnalyticsService.getEnrollmentTrends(companyId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    return res.ok("enrollment trends", { trends: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /teacher-activity
instituteAnalyticsV2Router.get("/teacher-activity", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await instituteAnalyticsService.getTeacherActivity(companyId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    return res.ok("teacher activity", { teachers: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /content-usage
instituteAnalyticsV2Router.get("/content-usage", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await instituteAnalyticsService.getContentUsage(companyId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    return res.ok("content usage", { content: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student-retention
instituteAnalyticsV2Router.get("/student-retention", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await instituteAnalyticsService.getStudentRetention(companyId, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    return res.ok("student retention", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /question-bank-stats
instituteAnalyticsV2Router.get("/question-bank-stats", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await instituteAnalyticsService.getQuestionBankStats(companyId);
    return res.ok("question bank stats", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
