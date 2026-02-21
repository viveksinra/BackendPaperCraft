import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createPaperSchema,
  updatePaperSchema,
  autoGenerateSchema,
  swapQuestionSchema,
  addQuestionSchema,
  removeQuestionSchema,
  listPapersQuerySchema,
} from "../../../shared/validation/paperValidation";
import * as paperService from "../../../services/paperService";
import * as autoGenService from "../../../services/autoGenerationService";
import { PdfType } from "../../../models/paper";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

const VALID_PDF_TYPES: PdfType[] = [
  "question_paper", "answer_sheet", "solution_paper", "passage", "marking_guide", "other",
];

export const papersV2Router = Router({ mergeParams: true });
papersV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/papers/stats — before /:paperId
papersV2Router.get("/stats", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const stats = await paperService.getPaperStats(companyId);
    return res.ok("paper stats", { stats });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/auto-generate — before /:paperId
papersV2Router.post("/auto-generate", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = autoGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await autoGenService.autoGeneratePaper(
      companyId, tenantId, parsed.data.blueprintId, parsed.data.templateId,
      parsed.data.title, parsed.data.overrideConstraints, userEmail
    );
    return res.ok("paper auto-generated", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/papers
papersV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const queryParsed = listPapersQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.fail(queryParsed.error.issues.map((i) => i.message).join(", "));
    }
    const { status, search, page, limit, sortBy, sortDir } = queryParsed.data;
    const result = await paperService.listPapers(
      companyId,
      { status, search },
      { page, limit, sortBy, sortDir }
    );
    return res.ok("papers", { papers: result.papers, total: result.total, page, limit });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers
papersV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createPaperSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.createPaper(companyId, tenantId, parsed.data, userEmail);
    return res.ok("paper created", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/papers/:paperId
papersV2Router.get("/:paperId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    const paper = await paperService.getPaperById(companyId, paperId);
    return res.ok("paper", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/papers/:paperId
papersV2Router.patch("/:paperId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updatePaperSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.updatePaper(companyId, paperId, parsed.data, userEmail);
    return res.ok("paper updated", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/papers/:paperId
papersV2Router.delete("/:paperId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    await paperService.deletePaper(companyId, paperId);
    return res.ok("paper deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/sections/:idx/questions
papersV2Router.post("/:paperId/sections/:idx/questions", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId, idx } = req.params;
    const sectionIndex = parseInt(idx, 10);
    const questionIds = req.body?.questionIds;
    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.fail("questionIds array is required");
    }
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.addQuestionsToSection(companyId, paperId, sectionIndex, questionIds, userEmail);
    return res.ok("questions added", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/papers/:paperId/sections/:idx/questions
papersV2Router.delete("/:paperId/sections/:idx/questions", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = removeQuestionSchema.safeParse({
      sectionIndex: parseInt(req.params.idx, 10),
      questionNumber: req.body?.questionNumber,
    });
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.removeQuestionFromSection(
      companyId, paperId, parsed.data.sectionIndex, parsed.data.questionNumber, userEmail
    );
    return res.ok("question removed", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/papers/:paperId/sections/:idx/reorder
papersV2Router.patch("/:paperId/sections/:idx/reorder", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId, idx } = req.params;
    const sectionIndex = parseInt(idx, 10);
    const orderedQuestionIds = req.body?.orderedQuestionIds;
    if (!Array.isArray(orderedQuestionIds)) {
      return res.fail("orderedQuestionIds array is required");
    }
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.reorderQuestionsInSection(companyId, paperId, sectionIndex, orderedQuestionIds, userEmail);
    return res.ok("questions reordered", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/swap-question
papersV2Router.post("/:paperId/swap-question", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = swapQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.swapQuestion(
      companyId, paperId, parsed.data.sectionIndex, parsed.data.questionNumber, parsed.data.newQuestionId, userEmail
    );
    return res.ok("question swapped", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/papers/:paperId/sections/:idx/questions/:qNum/swaps
papersV2Router.get("/:paperId/sections/:idx/questions/:qNum/swaps", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId, idx, qNum } = req.params;
    const alternatives = await autoGenService.getSuggestedSwaps(
      companyId, paperId, parseInt(idx, 10), parseInt(qNum, 10)
    );
    return res.ok("suggested swaps", { alternatives });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/finalize
papersV2Router.post("/:paperId/finalize", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const { paper, jobId } = await paperService.finalizePaper(companyId, paperId, userEmail);
    return res.ok("paper finalized", { paper, jobId });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/publish
papersV2Router.post("/:paperId/publish", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.publishPaper(companyId, paperId, userEmail);
    return res.ok("paper published", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/unfinalize
papersV2Router.post("/:paperId/unfinalize", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const paper = await paperService.unfinalizePaper(companyId, paperId, userEmail);
    return res.ok("paper unfinalized", { paper });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/papers/:paperId/generate-pdf
papersV2Router.post("/:paperId/generate-pdf", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    // Re-trigger PDF generation (same as finalize but doesn't change status)
    const { paper, jobId } = await paperService.finalizePaper(companyId, paperId, userEmail);
    return res.ok("PDF generation queued", { paper, jobId });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/papers/:paperId/download/:pdfType
papersV2Router.get("/:paperId/download/:pdfType", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperId, pdfType } = req.params;
    if (!VALID_PDF_TYPES.includes(pdfType as PdfType)) {
      return res.fail(`Invalid PDF type. Must be one of: ${VALID_PDF_TYPES.join(", ")}`);
    }
    const url = await paperService.getPaperPdfDownloadUrl(companyId, paperId, pdfType as PdfType);
    return res.ok("download url", { url });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
