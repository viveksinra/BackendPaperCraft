import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import * as elevenPlusService from "../../../services/elevenPlusAnalyticsService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const elevenPlusAnalyticsV2Router = Router({ mergeParams: true });
elevenPlusAnalyticsV2Router.use(ensureAuth, requireCompanyContext, ensureRole("teacher", "admin", "owner"));

// GET /students/:studentId/band
elevenPlusAnalyticsV2Router.get("/students/:studentId/band", async (req: Request, res: Response) => {
  try {
    const { companyId, studentId } = req.params;
    const result = await elevenPlusService.computeQualificationBand(studentId, companyId);
    return res.ok("qualification band", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /students/:studentId/components
elevenPlusAnalyticsV2Router.get(
  "/students/:studentId/components",
  async (req: Request, res: Response) => {
    try {
      const { companyId, studentId } = req.params;
      const result = await elevenPlusService.computeComponentScores(studentId, companyId);
      return res.ok("component scores", { components: result });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /students/:studentId/cohort-percentile
elevenPlusAnalyticsV2Router.get(
  "/students/:studentId/cohort-percentile",
  async (req: Request, res: Response) => {
    try {
      const { companyId, studentId } = req.params;
      const result = await elevenPlusService.computeCohortPercentile(studentId, companyId);
      return res.ok("cohort percentile", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /config
elevenPlusAnalyticsV2Router.get("/config", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await elevenPlusService.getQualificationBandConfig(companyId);
    return res.ok("band config", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /config (admin/owner only)
elevenPlusAnalyticsV2Router.put("/config", ensureRole("admin", "owner"), async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { strongPass, pass, borderline } = req.body;
    const email = (req as any).user?.email || "";
    const result = await elevenPlusService.updateQualificationBandConfig(
      companyId,
      { strongPass, pass, borderline },
      email
    );
    return res.ok("band config updated", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
