import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { updatePreferencesSchema } from "../../../shared/validation/notificationValidation";
import * as prefService from "../../../services/notificationPreferenceService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string };
};

export const notificationPreferencesV2Router = Router({ mergeParams: true });
notificationPreferencesV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/notification-preferences — Get preferences
notificationPreferencesV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const preferences = await prefService.getOrCreatePreferences(tenantId, companyId, userId);
    return res.ok("preferences", { preferences });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PUT /api/v2/companies/:companyId/notification-preferences — Update preferences
notificationPreferencesV2Router.put("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const preferences = await prefService.updatePreferences(
      tenantId,
      companyId,
      userId,
      parsed.data
    );
    return res.ok("preferences updated", { preferences });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
