import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  leaderboardSchema,
  pointsHistorySchema,
} from "../../../shared/validation/gamificationValidation";
import * as gamificationService from "../../../services/gamificationService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string };
};

export const gamificationV2Router = Router({ mergeParams: true });
gamificationV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/gamification/profile — Get student gamification profile
gamificationV2Router.get("/profile", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const profile = await gamificationService.getStudentProfile(
      tenantId,
      companyId,
      userId
    );
    return res.ok("gamification profile", { profile });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/gamification/profile/:studentUserId — Get specific student profile
gamificationV2Router.get("/profile/:studentUserId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, studentUserId } = req.params;

    const profile = await gamificationService.getStudentProfile(
      tenantId,
      companyId,
      studentUserId
    );
    return res.ok("gamification profile", { profile });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/gamification/points-history — Get points history
gamificationV2Router.get("/points-history", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = pointsHistorySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const result = await gamificationService.getPointsHistory(
      tenantId,
      companyId,
      userId,
      parsed.data
    );
    return res.ok("points history", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/gamification/leaderboard — Get leaderboard
gamificationV2Router.get("/leaderboard", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = leaderboardSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const result = await gamificationService.getLeaderboard(
      tenantId,
      companyId,
      parsed.data
    );
    return res.ok("leaderboard", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/gamification/badges — Get student badges
gamificationV2Router.get("/badges", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const profile = await gamificationService.getStudentProfile(
      tenantId,
      companyId,
      userId
    );
    return res.ok("badges", { badges: profile.badges });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/gamification/streak — Get streak info
gamificationV2Router.get("/streak", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const profile = await gamificationService.getStudentProfile(
      tenantId,
      companyId,
      userId
    );
    return res.ok("streak", {
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      lastActivityDate: profile.lastActivityDate,
      streakHistory: profile.streakHistory.slice(-30),
    });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
