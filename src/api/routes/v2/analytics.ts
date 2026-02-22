import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  analyticsQuerySchema,
  topicDrilldownSchema,
  classTestAnalyticsSchema,
} from "../../../shared/validation/analyticsValidation";
import * as studentAnalyticsService from "../../../services/studentAnalyticsService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const analyticsV2Router = Router({ mergeParams: true });
analyticsV2Router.use(ensureAuth, requireCompanyContext, ensureRole("teacher", "admin", "owner"));

// GET /students/:studentId
analyticsV2Router.get("/students/:studentId", async (req: Request, res: Response) => {
  try {
    const { companyId, studentId } = req.params;
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const result = await studentAnalyticsService.getStudentAnalytics(companyId, studentId, {
      period: parsed.data.period,
      forceRefresh: parsed.data.forceRefresh,
    });
    return res.ok("student analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /students/:studentId/score-trend
analyticsV2Router.get("/students/:studentId/score-trend", async (req: Request, res: Response) => {
  try {
    const { companyId, studentId } = req.params;
    const result = await studentAnalyticsService.getStudentScoreTrend(companyId, studentId);
    return res.ok("score trend", { trend: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /students/:studentId/subject-radar
analyticsV2Router.get("/students/:studentId/subject-radar", async (req: Request, res: Response) => {
  try {
    const { companyId, studentId } = req.params;
    const result = await studentAnalyticsService.getStudentSubjectRadar(companyId, studentId);
    return res.ok("subject radar", { subjects: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /students/:studentId/topic-drilldown/:subjectId
analyticsV2Router.get(
  "/students/:studentId/topic-drilldown/:subjectId",
  async (req: Request, res: Response) => {
    try {
      const { companyId, studentId, subjectId } = req.params;
      const parsed = topicDrilldownSchema.safeParse({ subjectId });
      if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      const result = await studentAnalyticsService.getStudentTopicDrilldown(
        companyId,
        studentId,
        subjectId
      );
      return res.ok("topic drilldown", { topics: result });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /students/:studentId/test-comparison/:testId
analyticsV2Router.get(
  "/students/:studentId/test-comparison/:testId",
  async (req: Request, res: Response) => {
    try {
      const { companyId, studentId, testId } = req.params;
      const parsed = classTestAnalyticsSchema.safeParse({ testId });
      if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      const result = await studentAnalyticsService.getStudentTestComparison(
        companyId,
        studentId,
        testId
      );
      return res.ok("test comparison", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /students/:studentId/time-trend
analyticsV2Router.get("/students/:studentId/time-trend", async (req: Request, res: Response) => {
  try {
    const { companyId, studentId } = req.params;
    const result = await studentAnalyticsService.getStudentTimeTrend(companyId, studentId);
    return res.ok("time trend", { trend: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
