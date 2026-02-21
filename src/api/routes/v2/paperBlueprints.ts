import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createPaperBlueprintSchema,
  updatePaperBlueprintSchema,
} from "../../../shared/validation/paperBlueprintValidation";
import * as blueprintService from "../../../services/paperBlueprintService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const paperBlueprintsV2Router = Router({ mergeParams: true });
paperBlueprintsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/paper-blueprints
paperBlueprintsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { search, isPreBuilt } = req.query as Record<string, string | undefined>;
    const blueprints = await blueprintService.listBlueprints(companyId, {
      search,
      isPreBuilt: isPreBuilt === "true" ? true : isPreBuilt === "false" ? false : undefined,
    });
    return res.ok("blueprints", { blueprints });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-blueprints
paperBlueprintsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createPaperBlueprintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const blueprint = await blueprintService.createBlueprint(companyId, tenantId, parsed.data, userEmail);
    return res.ok("blueprint created", { blueprint });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/paper-blueprints/:blueprintId
paperBlueprintsV2Router.get("/:blueprintId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, blueprintId } = req.params;
    const blueprint = await blueprintService.getBlueprintById(companyId, blueprintId);
    return res.ok("blueprint", { blueprint });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/paper-blueprints/:blueprintId
paperBlueprintsV2Router.patch("/:blueprintId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updatePaperBlueprintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, blueprintId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const blueprint = await blueprintService.updateBlueprint(companyId, blueprintId, parsed.data, userEmail);
    return res.ok("blueprint updated", { blueprint });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/paper-blueprints/:blueprintId
paperBlueprintsV2Router.delete("/:blueprintId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, blueprintId } = req.params;
    await blueprintService.deleteBlueprint(companyId, blueprintId);
    return res.ok("blueprint deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-blueprints/:blueprintId/clone
paperBlueprintsV2Router.post("/:blueprintId/clone", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, blueprintId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const blueprint = await blueprintService.cloneBlueprint(companyId, blueprintId, userEmail);
    return res.ok("blueprint cloned", { blueprint });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/paper-blueprints/:blueprintId/validate
paperBlueprintsV2Router.get("/:blueprintId/validate", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, blueprintId } = req.params;
    const result = await blueprintService.validateBlueprintFeasibility(companyId, blueprintId);
    return res.ok("feasibility check", { feasibility: result });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
