import { Router, Request, Response } from "express";
import path from "path";
import * as studentAnalyticsService from "../../../services/studentAnalyticsService";
import * as elevenPlusService from "../../../services/elevenPlusAnalyticsService";
import * as reportService from "../../../services/reportService";
import { isStudent } from "../../../shared/middleware/roleGuards";
import { StudentModel } from "../../../models/student";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

async function resolveCompanyId(req: AuthedRequest, userId: string): Promise<string> {
  // Try explicit header / query first
  const explicit = (req as any).companyId || req.headers["x-company-id"] as string || req.query.companyId as string;
  if (explicit) return explicit;

  // Fall back to the student's first active organization
  const student = await StudentModel.findOne({ userId });
  const activeOrg = student?.organizations?.find((o) => o.isActive);
  if (activeOrg) return activeOrg.companyId.toString();

  throw Object.assign(new Error("No organization found for this student. Please join an organization first."), { status: 400 });
}

export const studentAnalyticsV2Router = Router({ mergeParams: true });
studentAnalyticsV2Router.use(ensureAuth, isStudent);

// GET /student/analytics -- own analytics
studentAnalyticsV2Router.get("/analytics", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req, userId);
    const result = await studentAnalyticsService.getStudentAnalytics(companyId, userId);
    return res.ok("student analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/score-trend
studentAnalyticsV2Router.get("/analytics/score-trend", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req, userId);
    const result = await studentAnalyticsService.getStudentScoreTrend(companyId, userId);
    return res.ok("score trend", { trend: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/subject-radar
studentAnalyticsV2Router.get("/analytics/subject-radar", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req, userId);
    const result = await studentAnalyticsService.getStudentSubjectRadar(companyId, userId);
    return res.ok("subject radar", { subjects: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/analytics/eleven-plus
studentAnalyticsV2Router.get("/analytics/eleven-plus", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const companyId = await resolveCompanyId(req, userId);
    const [band, components, percentile] = await Promise.all([
      elevenPlusService.computeQualificationBand(userId, companyId),
      elevenPlusService.computeComponentScores(userId, companyId),
      elevenPlusService.computeCohortPercentile(userId, companyId),
    ]);
    return res.ok("eleven plus analytics", { band, components, percentile });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /student/reports
studentAnalyticsV2Router.get("/reports", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const result = await reportService.getStudentReports(userId);
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
