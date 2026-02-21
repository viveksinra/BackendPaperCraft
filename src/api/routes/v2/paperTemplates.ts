import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createPaperTemplateSchema,
  updatePaperTemplateSchema,
} from "../../../shared/validation/paperTemplateValidation";
import * as templateService from "../../../services/paperTemplateService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const paperTemplatesV2Router = Router({ mergeParams: true });
paperTemplatesV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/paper-templates
paperTemplatesV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { search, isPreBuilt } = req.query as Record<string, string | undefined>;
    const templates = await templateService.listTemplates(companyId, {
      search,
      isPreBuilt: isPreBuilt === "true" ? true : isPreBuilt === "false" ? false : undefined,
    });
    return res.ok("templates", { templates });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-templates
paperTemplatesV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createPaperTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const template = await templateService.createTemplate(companyId, tenantId, parsed.data, userEmail);
    return res.ok("template created", { template });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/paper-templates/:templateId
paperTemplatesV2Router.get("/:templateId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, templateId } = req.params;
    const template = await templateService.getTemplateById(companyId, templateId);
    return res.ok("template", { template });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/paper-templates/:templateId
paperTemplatesV2Router.patch("/:templateId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updatePaperTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, templateId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const template = await templateService.updateTemplate(companyId, templateId, parsed.data, userEmail);
    return res.ok("template updated", { template });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/paper-templates/:templateId
paperTemplatesV2Router.delete("/:templateId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, templateId } = req.params;
    await templateService.deleteTemplate(companyId, templateId);
    return res.ok("template deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-templates/:templateId/clone
paperTemplatesV2Router.post("/:templateId/clone", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, templateId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const template = await templateService.cloneTemplate(companyId, templateId, userEmail);
    return res.ok("template cloned", { template });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
