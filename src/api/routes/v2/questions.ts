import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
  reviewActionSchema,
} from "../../../shared/validation/questionValidation";
import * as questionService from "../../../services/questionService";
import * as bulkImportService from "../../../services/bulkImportService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const questionsV2Router = Router({ mergeParams: true });
questionsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/questions/stats — before /:questionId
questionsV2Router.get("/stats", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const stats = await questionService.getQuestionStats(companyId);
    return res.ok("question stats", { stats });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/questions/bulk-import — before /:questionId
questionsV2Router.post("/bulk-import", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const { source, fileName, fileKey, fileContent } = req.body;

    if (!source || !fileName) {
      return res.fail("source and fileName are required");
    }

    const job = await bulkImportService.initiateImport(
      companyId, tenantId, source, fileKey, fileName, userEmail
    );

    // If fileContent is provided inline (paste or direct upload), parse immediately
    if (fileContent) {
      const parsed = await bulkImportService.parseUploadedFile(
        job._id!.toString(),
        fileContent
      );
      return res.ok("import job created and parsed", { job: parsed });
    }

    return res.ok("import job created", { job });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/questions/bulk-import/:jobId
questionsV2Router.get("/bulk-import/:jobId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, jobId } = req.params;
    const job = await bulkImportService.getImportJobStatus(companyId, jobId);
    return res.ok("import job status", { job });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/questions/bulk-import/:jobId/confirm
questionsV2Router.post("/bulk-import/:jobId/confirm", async (req: AuthedRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const { questions, subjectMapping, defaultMetadata } = req.body;
    const job = await bulkImportService.confirmImport(
      jobId, questions, subjectMapping, defaultMetadata
    );
    return res.ok("import confirmed", { job });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/questions
questionsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const queryParsed = listQuestionsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.fail(queryParsed.error.issues.map((i) => i.message).join(", "));
    }
    const { page, limit, sortBy, sortDir, search, type, difficulty, subjectId, chapterId, topicId, status, archived, tags, examType } = queryParsed.data;
    const result = await questionService.listQuestions(
      companyId,
      { search, type, difficulty, subjectId, chapterId, topicId, status, archived, tags, examType },
      { page, limit, sortBy, sortDir }
    );
    return res.ok("questions", {
      questions: result.questions,
      total: result.total,
      page,
      limit,
    });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/questions
questionsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.createQuestion(companyId, tenantId, parsed.data, userEmail);
    return res.ok("question created", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/questions/:questionId
questionsV2Router.get("/:questionId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, questionId } = req.params;
    const question = await questionService.getQuestionById(companyId, questionId);
    return res.ok("question", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/questions/:questionId
questionsV2Router.patch("/:questionId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, questionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.updateQuestion(companyId, questionId, parsed.data, userEmail);
    return res.ok("question updated", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/questions/:questionId
questionsV2Router.delete("/:questionId", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, questionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.archiveQuestion(companyId, questionId, userEmail);
    return res.ok("question archived", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/questions/:questionId/restore
questionsV2Router.post("/:questionId/restore", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, questionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.restoreQuestion(companyId, questionId, userEmail);
    return res.ok("question restored", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/questions/:questionId/duplicate
questionsV2Router.post("/:questionId/duplicate", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, questionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.duplicateQuestion(companyId, questionId, userEmail);
    return res.ok("question duplicated", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/questions/:questionId/review
questionsV2Router.patch("/:questionId/review", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = reviewActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, questionId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const question = await questionService.reviewQuestion(
      companyId, questionId, parsed.data.action, parsed.data.notes, userEmail
    );
    return res.ok("question review updated", { question });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
