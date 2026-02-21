import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createPaperSetSchema,
  updatePaperSetSchema,
  addPaperToSetSchema,
  listPaperSetsQuerySchema,
} from "../../../shared/validation/paperSetValidation";
import * as paperSetService from "../../../services/paperSetService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const paperSetsV2Router = Router({ mergeParams: true });
paperSetsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/paper-sets
paperSetsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const queryParsed = listPaperSetsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.fail(queryParsed.error.issues.map((i) => i.message).join(", "));
    }
    const { status, examType, search, page, limit, sortBy, sortDir } = queryParsed.data;
    const result = await paperSetService.listPaperSets(
      companyId,
      { status, examType, search },
      { page, limit, sortBy, sortDir }
    );
    return res.ok("paper sets", { paperSets: result.paperSets, total: result.total, page, limit });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-sets
paperSetsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createPaperSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.createPaperSet(companyId, tenantId, parsed.data, userEmail);
    return res.ok("paper set created", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/paper-sets/:paperSetId
paperSetsV2Router.get("/:paperSetId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    const paperSet = await paperSetService.getPaperSetById(companyId, paperSetId);
    return res.ok("paper set", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/paper-sets/:paperSetId
paperSetsV2Router.patch("/:paperSetId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updatePaperSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, paperSetId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.updatePaperSet(companyId, paperSetId, parsed.data, userEmail);
    return res.ok("paper set updated", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/paper-sets/:paperSetId
paperSetsV2Router.delete("/:paperSetId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    await paperSetService.deletePaperSet(companyId, paperSetId);
    return res.ok("paper set deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-sets/:paperSetId/papers
paperSetsV2Router.post("/:paperSetId/papers", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = addPaperToSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, paperSetId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.addPaperToSet(companyId, paperSetId, parsed.data.paperId, userEmail);
    return res.ok("paper added to set", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/paper-sets/:paperSetId/papers/:paperId
paperSetsV2Router.delete("/:paperSetId/papers/:paperId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.removePaperFromSet(companyId, paperSetId, paperId, userEmail);
    return res.ok("paper removed from set", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-sets/:paperSetId/upload-pdf
paperSetsV2Router.post("/:paperSetId/upload-pdf", async (req: AuthedRequest, res: Response) => {
  try {
    // This route would use multer middleware in production
    // For now, return a placeholder
    return res.fail("File upload not yet configured. Add multer middleware.");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/paper-sets/:paperSetId/pdfs/:pdfIndex
paperSetsV2Router.delete("/:paperSetId/pdfs/:pdfIndex", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId, pdfIndex } = req.params;
    const paperIndex = parseInt(req.body?.paperIndex ?? "0", 10);
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.deletePaperSetPdf(
      companyId, paperSetId, paperIndex, parseInt(pdfIndex, 10), userEmail
    );
    return res.ok("PDF deleted", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-sets/:paperSetId/publish
paperSetsV2Router.post("/:paperSetId/publish", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.publishPaperSet(companyId, paperSetId, userEmail);
    return res.ok("paper set published", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/paper-sets/:paperSetId/archive
paperSetsV2Router.post("/:paperSetId/archive", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paperSet = await paperSetService.archivePaperSet(companyId, paperSetId, userEmail);
    return res.ok("paper set archived", { paperSet });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/paper-sets/:paperSetId/download-zip
paperSetsV2Router.get("/:paperSetId/download-zip", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    const stream = await paperSetService.downloadPaperSetAsZip(companyId, paperSetId);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="paper-set-${paperSetId}.zip"`);
    stream.pipe(res);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
