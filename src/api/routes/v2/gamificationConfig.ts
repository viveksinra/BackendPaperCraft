import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  updateConfigSchema,
  addBadgeSchema,
  updateBadgeSchema,
  manualAwardSchema,
} from "../../../shared/validation/gamificationValidation";
import * as configService from "../../../services/gamificationConfigService";
import * as gamificationService from "../../../services/gamificationService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string };
};

export const gamificationConfigV2Router = Router({ mergeParams: true });
gamificationConfigV2Router.use(ensureAuth, requireCompanyContext, ensureRole("admin", "teacher"));

// GET /api/v2/companies/:companyId/gamification-config — Get config
gamificationConfigV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    const config = await configService.getOrCreateConfig(tenantId, companyId, userEmail);
    return res.ok("gamification config", { config });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /api/v2/companies/:companyId/gamification-config — Update config
gamificationConfigV2Router.put("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    const config = await configService.updateConfig(
      tenantId,
      companyId,
      parsed.data,
      userEmail
    );
    return res.ok("config updated", { config });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/gamification-config/badges — Add badge
gamificationConfigV2Router.post("/badges", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addBadgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    const config = await configService.addBadge(
      tenantId,
      companyId,
      parsed.data as any,
      userEmail
    );
    return res.status(201).sendEnvelope("badge added", "success", { config });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/gamification-config/badges/:badgeId — Update badge
gamificationConfigV2Router.patch("/badges/:badgeId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateBadgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, badgeId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    const config = await configService.updateBadge(
      tenantId,
      companyId,
      badgeId,
      parsed.data as any,
      userEmail
    );
    return res.ok("badge updated", { config });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/gamification-config/badges/:badgeId — Delete badge
gamificationConfigV2Router.delete("/badges/:badgeId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, badgeId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    const config = await configService.deleteBadge(tenantId, companyId, badgeId, userEmail);
    return res.ok("badge deleted", { config });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/gamification-config/award-points — Manual award
gamificationConfigV2Router.post("/award-points", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = manualAwardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const result = await gamificationService.manualAwardPoints(
      tenantId,
      companyId,
      parsed.data.studentUserId,
      parsed.data.points,
      parsed.data.description
    );
    return res.ok("points awarded", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/gamification-config/reset-weekly — Reset weekly points
gamificationConfigV2Router.post("/reset-weekly", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const count = await gamificationService.resetWeeklyPoints(tenantId, companyId);
    return res.ok("weekly points reset", { count });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
