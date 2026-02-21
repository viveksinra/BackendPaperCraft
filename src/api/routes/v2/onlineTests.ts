import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  createOnlineTestSchema,
  updateOnlineTestSchema,
} from "../../../shared/validation/onlineTestValidation";
import {
  gradeAnswerSchema,
  bulkGradeSchema,
  extendTimeSchema,
} from "../../../shared/validation/testTakingValidation";
import * as onlineTestService from "../../../services/onlineTestService";
import * as testAttemptService from "../../../services/testAttemptService";
import * as gradingService from "../../../services/gradingService";
import * as resultComputationService from "../../../services/resultComputationService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const onlineTestsV2Router = Router({ mergeParams: true });
onlineTestsV2Router.use(ensureAuth, requireCompanyContext);

// ─── CRUD ─────────────────────────────────────────────────────────────────

// GET /api/v2/companies/:companyId/online-tests
onlineTestsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await onlineTestService.listTests(
      companyId,
      req.query as Record<string, string>,
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortDir: (req.query.sortDir as string) === "asc" ? "asc" : "desc",
      }
    );
    return res.ok("tests listed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/online-tests
onlineTestsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createOnlineTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const test = await onlineTestService.createTest(
      companyId,
      tenantId,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("test created", { test });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/online-tests/:testId
onlineTestsV2Router.get(
  "/:testId",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const test = await onlineTestService.getTestById(companyId, testId);
      return res.ok("test detail", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// PATCH /api/v2/companies/:companyId/online-tests/:testId
onlineTestsV2Router.patch(
  "/:testId",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = updateOnlineTestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.updateTest(
        companyId,
        testId,
        parsed.data as Record<string, unknown>,
        userEmail
      );
      return res.ok("test updated", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// DELETE /api/v2/companies/:companyId/online-tests/:testId
onlineTestsV2Router.delete(
  "/:testId",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      await onlineTestService.deleteTest(companyId, testId);
      return res.ok("test deleted");
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Duplicate ────────────────────────────────────────────────────────────

onlineTestsV2Router.post(
  "/:testId/duplicate",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.duplicateTest(
        companyId,
        testId,
        userEmail
      );
      return res.ok("test duplicated", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Lifecycle ────────────────────────────────────────────────────────────

onlineTestsV2Router.post(
  "/:testId/schedule",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.scheduleTest(
        companyId,
        testId,
        userEmail
      );
      return res.ok("test scheduled", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/go-live",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.goLive(companyId, testId, userEmail);
      return res.ok("test is now live", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/complete",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.completeTest(
        companyId,
        testId,
        userEmail
      );
      return res.ok("test completed", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/archive",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.archiveTest(
        companyId,
        testId,
        userEmail
      );
      return res.ok("test archived", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/publish-results",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.publishResults(
        companyId,
        testId,
        userEmail
      );
      return res.ok("results published", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Time extension and pause/resume ──────────────────────────────────────

onlineTestsV2Router.post(
  "/:testId/extend-time",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = extendTimeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const test = await onlineTestService.extendTestTime(
        companyId,
        testId,
        parsed.data.additionalMinutes,
        userEmail
      );
      return res.ok("test time extended", { test });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/pause",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      await onlineTestService.pauseTest(companyId, testId, userEmail);
      return res.ok("test paused");
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/resume",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      await onlineTestService.resumeTest(companyId, testId, userEmail);
      return res.ok("test resumed");
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Stats and monitoring ─────────────────────────────────────────────────

onlineTestsV2Router.get(
  "/:testId/stats",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const stats = await onlineTestService.getTestStats(companyId, testId);
      return res.ok("test stats", { stats });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.get(
  "/:testId/live-status",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const status = await onlineTestService.getLiveTestStatus(
        companyId,
        testId
      );
      return res.ok("live status", { status });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Attempts ─────────────────────────────────────────────────────────────

onlineTestsV2Router.get(
  "/:testId/attempts",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const result = await testAttemptService.listAttempts(
        companyId,
        testId,
        req.query as Record<string, string>,
        {
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 20,
        }
      );
      return res.ok("attempts listed", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Grading ──────────────────────────────────────────────────────────────

onlineTestsV2Router.get(
  "/:testId/grading",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const ungradedAnswers = await gradingService.getUngradedAnswers(
        companyId,
        testId
      );
      return res.ok("ungraded answers", { ungradedAnswers });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/grade",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();

      // Check if bulk or single grade
      if (req.body.grades) {
        const parsed = bulkGradeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.fail(
            parsed.error.issues.map((i) => i.message).join(", ")
          );
        }
        const count = await gradingService.bulkGradeQuestion(
          companyId,
          testId,
          parsed.data.questionId,
          parsed.data.grades,
          userEmail
        );
        return res.ok("bulk grading complete", { gradedCount: count });
      } else {
        const parsed = gradeAnswerSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.fail(
            parsed.error.issues.map((i) => i.message).join(", ")
          );
        }
        const answer = await gradingService.gradeAnswer(
          companyId,
          testId,
          parsed.data.attemptId,
          parsed.data.questionId,
          parsed.data.marks,
          parsed.data.feedback || "",
          userEmail
        );
        return res.ok("answer graded", { answer });
      }
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

onlineTestsV2Router.post(
  "/:testId/finalize-grading",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const userEmail = (req.auth?.sub || "").toLowerCase();
      const result = await gradingService.finalizeGrading(
        companyId,
        testId,
        userEmail
      );
      return res.ok("grading finalized", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// ─── Export results ───────────────────────────────────────────────────────

onlineTestsV2Router.get(
  "/:testId/export-results",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, testId } = req.params;
      const csv = await resultComputationService.exportResultsCsv(
        companyId,
        testId
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="test-results-${testId}.csv"`
      );
      return res.send(csv);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
