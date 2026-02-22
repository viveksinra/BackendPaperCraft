import { Router, Request, Response } from "express";
import path from "path";
import * as studentAnalyticsService from "../../../services/studentAnalyticsService";
import * as elevenPlusService from "../../../services/elevenPlusAnalyticsService";
import * as reportService from "../../../services/reportService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const studentAnalyticsV2Router = Router({ mergeParams: true });
studentAnalyticsV2Router.use(ensureAuth);

// GET /student/analytics -- own analytics
studentAnalyticsV2Router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = (req as any).companyId || req.headers["x-company-id"] as string || "";
    const result = await studentAnalyticsService.getStudentAnalytics(companyId, user._id.toString());
    return res.ok("student analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/score-trend
studentAnalyticsV2Router.get("/analytics/score-trend", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = (req as any).companyId || req.headers["x-company-id"] as string || "";
    const result = await studentAnalyticsService.getStudentScoreTrend(companyId, user._id.toString());
    return res.ok("score trend", { trend: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/subject-radar
studentAnalyticsV2Router.get("/analytics/subject-radar", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = (req as any).companyId || req.headers["x-company-id"] as string || "";
    const result = await studentAnalyticsService.getStudentSubjectRadar(companyId, user._id.toString());
    return res.ok("subject radar", { subjects: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/eleven-plus
studentAnalyticsV2Router.get("/analytics/eleven-plus", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = (req as any).companyId || req.headers["x-company-id"] as string || "";
    const [band, components, percentile] = await Promise.all([
      elevenPlusService.computeQualificationBand(user._id.toString(), companyId),
      elevenPlusService.computeComponentScores(user._id.toString(), companyId),
      elevenPlusService.computeCohortPercentile(user._id.toString(), companyId),
    ]);
    return res.ok("eleven plus analytics", { band, components, percentile });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/reports
studentAnalyticsV2Router.get("/reports", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await reportService.getStudentReports(user._id.toString());
    return res.ok("student reports", { reports: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/reports/:reportId/download
studentAnalyticsV2Router.get("/reports/:reportId/download", async (req: Request, res: Response) => {
  try {
    const result = await reportService.downloadReport(req.params.reportId);
    return res.ok("download url", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
