import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import path from "path";
import {
  ensureCompanySettingsDocument,
  mergeBrandingSettings,
  mergeSeoDefaults,
} from "../../../services/companySettings";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { bootstrapCompanyWorkspace, getBootstrapStatus } from "../../../services/tenantBootstrap";
import { logger } from "../../../shared/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Company = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Company"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Membership"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string };
  activeCompanyId?: string | mongoose.Types.ObjectId;
};

export const companiesV2Router = Router();
companiesV2Router.use(ensureAuth);

companiesV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const email = (req.auth?.sub || "").toLowerCase();
    const memberships = await Membership.find({ userEmail: email });
    const companyIds = memberships.map((m: { companyId: mongoose.Types.ObjectId }) => m.companyId);
    const companies = await Company.find({ _id: { $in: companyIds } }).sort({ createdAt: -1 });
    const membershipMap = new Map<string, { role?: string }>();
    memberships.forEach((membership: { companyId: mongoose.Types.ObjectId; role?: string }) => {
      membershipMap.set(membership.companyId.toString(), membership);
    });
    const userDoc = await User.findOne({ email });
    const lastActiveCompanyId = userDoc?.lastActiveCompanyId ? userDoc.lastActiveCompanyId.toString() : null;
    const payload = companies.map((company: Record<string, any>) => {
      const companyId = company._id.toString();
      return {
        id: companyId,
        name: company.name,
        slug: company.slug,
        role: membershipMap.get(companyId)?.role || "teacher",
        createdAt: company.createdAt,
        brand: {
          displayName: company.brandSettings?.displayName || company.name,
          logo: company.brandSettings?.logo || null,
        },
      };
    });
    return res.ok("companies", {
      companies: payload,
      activeCompanyId: req.activeCompanyId ? req.activeCompanyId.toString() : null,
      lastActiveCompanyId,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("list companies error", error);
    return res.status(500).sendEnvelope("failed to list companies", "error");
  }
});

companiesV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    if (!name) {
      return res.fail("company name required");
    }
    
    // Username is required when creating a company
    const username = (req.body?.username || "").toString().trim().toLowerCase();
    if (!username) {
      return res.fail("username is required");
    }
    if (username.length < 3) {
      return res.fail("username must be at least 3 characters");
    }
    if (username.length > 30) {
      return res.fail("username must be 30 characters or less");
    }
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return res.fail("username can only contain lowercase letters, numbers, underscores, and hyphens");
    }
    
    // Check username uniqueness
    const existingUsername = await Company.findOne({ username });
    if (existingUsername) {
      return res.fail("username is already taken");
    }
    
    const owner = (req.auth?.sub || "").toLowerCase();
    const company = new Company({ name, owner, username });
    await company.save();
    const membership = new Membership({
      companyId: company._id,
      userEmail: owner,
      role: "owner",
    });
    await membership.save();
    await User.findOneAndUpdate({ email: owner }, { lastActiveCompanyId: company._id });
    const tenantId = req.tenantId || "devTenant";
    const identifier = company.username || company.slug || company._id.toString();

    bootstrapCompanyWorkspace({
      companyId: company._id.toString(),
      tenantId,
      companySlug: identifier,
      requestedBy: owner,
    }).catch((error) =>
      logger.warn({
        msg: "bootstrap workspace failed",
        companyId: company._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return res.ok("company created", {
      company: {
        id: company._id.toString(),
        name: company.name,
        slug: company.slug,
        username: company.username,
        owner: company.owner,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("create company error", error);
    if (error instanceof Error && error.message.includes("duplicate key")) {
      return res.fail("username is already taken");
    }
    return res.status(500).sendEnvelope("failed to create company", "error");
  }
});

companiesV2Router.get("/:companyId/settings", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }
    const company = await Company.findById(new mongoose.Types.ObjectId(companyId));
    if (!company) {
      return res.status(404).sendEnvelope("company not found", "error");
    }
    const tenantId = req.tenantId || "devTenant";
    const settings = await ensureCompanySettingsDocument(companyId, tenantId);
    return res.ok("company settings", {
      company: {
        id: company._id.toString(),
        name: company.name,
        slug: company.slug,
        description: company.description || null,
        websiteUrl: company.websiteUrl || null,
        contactEmail: company.contactEmail || null,
      },
      branding: mergeBrandingSettings({ ...(company.brandSettings || {}), ...(settings.branding || {}) }),
      seo: mergeSeoDefaults(settings.seoDefaults || {}),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("company settings error", error);
    return res.status(500).sendEnvelope("failed to load settings", "error");
  }
});

companiesV2Router.get(
  "/:companyId/bootstrap-status",
  requireCompanyContext,
  async (req: AuthedRequest, res: Response) => {
    try {
      const companyId = req.params.companyId;
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.fail("invalid companyId");
      }
      const membership = await Membership.findOne({
        companyId: new mongoose.Types.ObjectId(companyId),
        userEmail: (req.auth?.sub || "").toLowerCase(),
      });
      if (!membership) {
        return res.status(403).sendEnvelope("not a member of this company", "error");
      }
      const status = await getBootstrapStatus({
        companyId,
        tenantId: req.tenantId || "devTenant",
      });
      return res.ok("bootstrap status", { status });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("bootstrap status error", error);
      return res.status(500).sendEnvelope("failed to load bootstrap status", "error");
    }
  }
);

companiesV2Router.patch("/:companyId/branding", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    const updates = extractBrandingPayload(req.body || {});
    await Company.findByIdAndUpdate(companyId, {
      $set: {
        "brandSettings.displayName": updates.displayName,
        "brandSettings.logo": updates.logo,
        "brandSettings.tagline": updates.tagline,
        "brandSettings.primaryColor": updates.primaryColor,
        "brandSettings.secondaryColor": updates.secondaryColor,
        "brandSettings.accentColor": updates.accentColor,
        "brandSettings.fontFamily": updates.fontFamily,
        "brandSettings.headingFont": updates.headingFont,
      },
    });
    return res.ok("branding updated");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("update branding error", error);
    return res.status(500).sendEnvelope("failed to update branding", "error");
  }
});

companiesV2Router.patch("/:companyId/seo", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    const tenantId = req.tenantId || "devTenant";
    const settings = await ensureCompanySettingsDocument(companyId, tenantId);
    settings.seoDefaults = mergeSeoDefaults({
      ...settings.seoDefaults,
      metaTitleTemplate: sanitizeText(req.body?.metaTitleTemplate, 160),
      metaDescriptionTemplate: sanitizeText(req.body?.metaDescriptionTemplate, 260),
      schemaType: sanitizeText(req.body?.schemaType, 40) || "Article",
      canonicalPattern: sanitizeText(req.body?.canonicalPattern, 200) || "",
      ogTitleTemplate: sanitizeText(req.body?.ogTitleTemplate, 160) || "",
      ogDescriptionTemplate: sanitizeText(req.body?.ogDescriptionTemplate, 260) || "",
      twitterHandle: sanitizeText(req.body?.twitterHandle, 50) || "",
    });
    await settings.save();
    return res.ok("seo defaults updated", { seo: settings.seoDefaults });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("seo update error", error);
    return res.status(500).sendEnvelope("failed to update seo defaults", "error");
  }
});

companiesV2Router.get("/:companyId/info", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }
    const company = await Company.findById(new mongoose.Types.ObjectId(companyId));
    if (!company) {
      return res.status(404).sendEnvelope("company not found", "error");
    }
    return res.ok("company info", {
      company: {
        id: company._id.toString(),
        name: company.name,
        slug: company.slug,
        username: company.username || null,
        description: company.description || null,
        websiteUrl: company.websiteUrl || null,
        contactEmail: company.contactEmail || null,
        createdAt: company.createdAt,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("company info error", error);
    return res.status(500).sendEnvelope("failed to load company info", "error");
  }
});

companiesV2Router.patch("/:companyId/info", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }
    const company = await Company.findById(new mongoose.Types.ObjectId(companyId));
    if (!company) {
      return res.status(404).sendEnvelope("company not found", "error");
    }

    const updates: Record<string, string | null> = {};
    
    // Name is required and triggers slug regeneration via model hook
    if (req.body?.name !== undefined) {
      const name = sanitizeText(req.body.name, 200);
      if (!name) {
        return res.fail("company name cannot be empty");
      }
      updates.name = name;
    }
    
    // Optional fields
    if (req.body?.description !== undefined) {
      updates.description = req.body.description ? sanitizeText(req.body.description, 500) : null;
    }
    
    if (req.body?.websiteUrl !== undefined) {
      const url = req.body.websiteUrl ? sanitizeText(req.body.websiteUrl, 255) : null;
      if (url) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return res.fail("website URL must use http or https");
          }
        } catch {
          return res.fail("invalid website URL format");
        }
      }
      updates.websiteUrl = url;
    }
    
    if (req.body?.contactEmail !== undefined) {
      const email = req.body.contactEmail ? sanitizeText(req.body.contactEmail, 255).toLowerCase() : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.fail("invalid contact email format");
      }
      updates.contactEmail = email;
    }
    
    if (req.body?.username !== undefined) {
      const username = req.body.username ? sanitizeText(req.body.username, 30).toLowerCase() : null;
      if (username) {
        if (username.length < 3) {
          return res.fail("username must be at least 3 characters");
        }
        if (!/^[a-z0-9_-]+$/.test(username)) {
          return res.fail("username can only contain lowercase letters, numbers, underscores, and hyphens");
        }
        // Check uniqueness
        const existing = await Company.findOne({ username, _id: { $ne: companyId } });
        if (existing) {
          return res.fail("username is already taken");
        }
      }
      updates.username = username;
    }

    if (Object.keys(updates).length === 0) {
      return res.fail("no valid fields to update");
    }

    const updated = await Company.findByIdAndUpdate(companyId, { $set: updates }, { new: true, runValidators: true });
    
    return res.ok("company info updated", {
      company: {
        id: updated._id.toString(),
        name: updated.name,
        slug: updated.slug,
        username: updated.username || null,
        description: updated.description || null,
        websiteUrl: updated.websiteUrl || null,
        contactEmail: updated.contactEmail || null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("update company info error", error);
    if (error instanceof Error && error.message.includes("validation")) {
      return res.fail(error.message);
    }
    return res.status(500).sendEnvelope("failed to update company info", "error");
  }
});

companiesV2Router.post("/:companyId/select", requireCompanyContext, async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }
    const email = (req.auth?.sub || "").toLowerCase();
    await User.findOneAndUpdate({ email }, { lastActiveCompanyId: companyId });
    const isProd = process.env.NODE_ENV === "production";
    const cookie = [
      `active_company=${encodeURIComponent(companyId)}`,
      "Path=/",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 30}`,
      isProd ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    res.setHeader("Set-Cookie", cookie);
    return res.ok("active company selected", { companyId });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("select company error", error);
    return res.status(500).sendEnvelope("failed to select company", "error");
  }
});

function sanitizeText(value: unknown, max = 120) {
  return (value || "").toString().trim().slice(0, max);
}

function extractBrandingPayload(body: Record<string, unknown>) {
  const allowed = [
    "displayName",
    "logo",
    "tagline",
    "primaryColor",
    "secondaryColor",
    "accentColor",
    "fontFamily",
    "headingFont",
  ];
  return allowed.reduce<Record<string, string>>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      acc[key] = sanitizeText(body[key], 120);
    }
    return acc;
  }, {});
}

async function ensureMembership(companyId: string, userEmail: string) {
  return Membership.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    userEmail,
  });
}

