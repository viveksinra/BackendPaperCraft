import path from "path";
import { Types } from "mongoose";
import {
  ensureCompanySettingsDocument,
  mergeBrandingSettings,
} from "./companySettings";
import { logger } from "../shared/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Company = require(path.join(__dirname, "..", "..", "Models", "Company"));

const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID || "devTenant";

const BRAND_PALETTE = {
  primaryColor: "#0F172A",
  secondaryColor: "#1D4ED8",
  accentColor: "#06B6D4",
  fontFamily: "'Inter', sans-serif",
  headingFont: "'Inter', sans-serif",
};

export type BootstrapStatus = {
  brandingReady: boolean;
  settingsReady: boolean;
};

/**
 * Bootstrap a new company workspace.
 * Sets up default branding and settings for a newly created company.
 */
export async function bootstrapCompanyWorkspace(params: {
  companyId: string;
  tenantId?: string;
  companySlug: string;
  requestedBy?: string;
}) {
  const tenantId = params.tenantId || DEFAULT_TENANT;
  const requester = (params.requestedBy || "system").toLowerCase();
  logger.info({
    msg: "bootstrap workspace start",
    companyId: params.companyId,
    tenantId,
    requestedBy: requester,
  });

  const [company, settings] = await Promise.all([
    Company.findById(new Types.ObjectId(params.companyId)),
    ensureCompanySettingsDocument(params.companyId, tenantId),
  ]);

  if (!company) {
    throw new Error(`company ${params.companyId} not found while bootstrapping`);
  }

  const brandSnapshot = mergeBrandingSettings({
    ...settings.branding,
    ...BRAND_PALETTE,
    displayName: company.name,
  });

  settings.branding = brandSnapshot;
  await settings.save();

  company.brandSettings = brandSnapshot;
  company.markModified("brandSettings");
  await company.save();

  logger.info({
    msg: "bootstrap workspace complete",
    companyId: params.companyId,
  });
}

/**
 * Get bootstrap status for a company.
 */
export async function getBootstrapStatus(params: {
  companyId: string;
  tenantId?: string;
}): Promise<BootstrapStatus> {
  const tenantId = params.tenantId || DEFAULT_TENANT;
  const company = await Company.findById(new Types.ObjectId(params.companyId));
  const settings = await ensureCompanySettingsDocument(params.companyId, tenantId);

  return {
    brandingReady: Boolean(company?.brandSettings?.primaryColor),
    settingsReady: Boolean(settings?._id),
  };
}
