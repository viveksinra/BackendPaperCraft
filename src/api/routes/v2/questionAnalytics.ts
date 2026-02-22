import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { questionAnalyticsFilterSchema } from "../../../shared/validation/analyticsValidation";
import * as questionAnalyticsService from "../../../services/questionAnalyticsService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const questionAnalyticsV2Router = Router({ mergeParams: true });
questionAnalyticsV2Router.use(ensureAuth, requireCompanyContext);

// GET /
questionAnalyticsV2Router.get("/", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = questionAnalyticsFilterSchema.safeParse(req.query);
    if (!parsed.success) return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    const { page, pageSize, ...filters } = parsed.data;
    const result = await questionAnalyticsService.listQuestionAnalytics(
      companyId,
      filters,
      { page, pageSize }
    );
    return res.ok("question analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /problematic
questionAnalyticsV2Router.get("/problematic", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await questionAnalyticsService.getProblematicQuestions(companyId, limit);
    return res.ok("problematic questions", { questions: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /calibration
questionAnalyticsV2Router.get("/calibration", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await questionAnalyticsService.getDifficultyCalibrationReport(companyId);
    return res.ok("difficulty calibration", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /:questionId
questionAnalyticsV2Router.get("/:questionId", async (req: Request, res: Response) => {
  try {
    const { companyId, questionId } = req.params;
    const result = await questionAnalyticsService.getQuestionAnalytics(companyId, questionId);
    return res.ok("question analytics", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
