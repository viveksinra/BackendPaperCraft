import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import * as stripeConnectService from "../../../services/stripeConnectService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const stripeConnectV2Router = Router({ mergeParams: true });
stripeConnectV2Router.use(ensureAuth, requireCompanyContext);

// POST /api/v2/companies/:companyId/stripe/connect
stripeConnectV2Router.post("/connect", ensureRole("owner"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const adminEmail = (req.auth?.sub || "").toLowerCase();

    const accountId = await stripeConnectService.createConnectedAccount(companyId, tenantId, adminEmail);
    const onboardingUrl = await stripeConnectService.createOnboardingLink(companyId);

    return res.ok("stripe account created", { accountId, onboardingUrl });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/stripe/onboarding-link
stripeConnectV2Router.get("/onboarding-link", ensureRole("owner"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const onboardingUrl = await stripeConnectService.createOnboardingLink(companyId);
    return res.ok("onboarding link", { onboardingUrl });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/stripe/status
stripeConnectV2Router.get("/status", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const status = await stripeConnectService.verifyAccountStatus(companyId);
    return res.ok("stripe account status", status);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/stripe/dashboard-link
stripeConnectV2Router.get("/dashboard-link", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const dashboardUrl = await stripeConnectService.getAccountDashboardLink(companyId);
    return res.ok("dashboard link", { dashboardUrl });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/stripe/balance
stripeConnectV2Router.get("/balance", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const balance = await stripeConnectService.getAccountBalance(companyId);
    return res.ok("account balance", balance);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
