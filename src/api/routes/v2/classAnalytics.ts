import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import * as classAnalyticsService from "../../../services/classAnalyticsService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const classAnalyticsV2Router = Router({ mergeParams: true });
classAnalyticsV2Router.use(ensureAuth, requireCompanyContext, ensureRole("teacher", "admin", "owner"));

// GET /
classAnalyticsV2Router.get("/", async (req: Request, res: Response) => {
  try {
    const { companyId, classId } = req.params;
    const result = await classAnalyticsService.getClassAnalytics(companyId, classId);
    return res.ok("class analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /tests/:testId
classAnalyticsV2Router.get("/tests/:testId", async (req: Request, res: Response) => {
  try {
    const { companyId, classId, testId } = req.params;
    const result = await classAnalyticsService.getClassTestAnalytics(companyId, classId, testId);
    return res.ok("class test analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /heatmap/:subjectId
classAnalyticsV2Router.get("/heatmap/:subjectId", async (req: Request, res: Response) => {
  try {
    const { companyId, classId, subjectId } = req.params;
    const result = await classAnalyticsService.getClassTopicHeatmap(companyId, classId, subjectId);
    return res.ok("topic heatmap", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /trend
classAnalyticsV2Router.get("/trend", async (req: Request, res: Response) => {
  try {
    const { companyId, classId } = req.params;
    const result = await classAnalyticsService.getClassComparisonAcrossTests(companyId, classId);
    return res.ok("class trend", { trend: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /rankings/:testId
classAnalyticsV2Router.get("/rankings/:testId", async (req: Request, res: Response) => {
  try {
    const { companyId, classId, testId } = req.params;
    const result = await classAnalyticsService.getClassStudentRankings(companyId, classId, testId);
    return res.ok("student rankings", { rankings: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
