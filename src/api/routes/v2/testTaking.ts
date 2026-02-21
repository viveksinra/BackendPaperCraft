import { Router, Request, Response } from "express";
import path from "path";
import {
  submitAnswerSchema,
  flagQuestionSchema,
} from "../../../shared/validation/testTakingValidation";
import * as testAttemptService from "../../../services/testAttemptService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; studentId?: string };
};

export const testTakingV2Router = Router({ mergeParams: true });
testTakingV2Router.use(ensureAuth);

// POST /api/v2/tests/:testId/start
testTakingV2Router.post(
  "/:testId/start",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const companyId = (req.headers["x-company-id"] as string) || "";
      const tenantId = req.tenantId || "devTenant";
      const ipAddress = req.ip || "";
      const userAgent = req.headers["user-agent"] || "";

      const result = await testAttemptService.startAttempt(
        testId,
        studentId,
        companyId,
        tenantId,
        ipAddress,
        userAgent
      );
      return res.ok("attempt started", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/tests/:testId/attempt
testTakingV2Router.get(
  "/:testId/attempt",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const state = await testAttemptService.getAttemptState(testId, studentId);
      return res.ok("attempt state", state);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// POST /api/v2/tests/:testId/answer
testTakingV2Router.post(
  "/:testId/answer",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = submitAnswerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const result = await testAttemptService.submitAnswer(
        testId,
        studentId,
        parsed.data.questionId,
        parsed.data.answer
      );
      return res.ok("answer saved", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// POST /api/v2/tests/:testId/flag
testTakingV2Router.post(
  "/:testId/flag",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = flagQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      await testAttemptService.flagQuestion(
        testId,
        studentId,
        parsed.data.questionId,
        parsed.data.flagged
      );
      return res.ok("flag updated");
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// POST /api/v2/tests/:testId/submit
testTakingV2Router.post(
  "/:testId/submit",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const result = await testAttemptService.submitTest(testId, studentId);
      return res.ok("test submitted", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/tests/:testId/result
testTakingV2Router.get(
  "/:testId/result",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const result = await testAttemptService.getResult(testId, studentId);
      return res.ok("test result", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/tests/:testId/result/:attemptNumber
testTakingV2Router.get(
  "/:testId/result/:attemptNumber",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId, attemptNumber } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const result = await testAttemptService.getResult(
        testId,
        studentId,
        parseInt(attemptNumber, 10)
      );
      return res.ok("test result", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// POST /api/v2/tests/:testId/section/:index/start
testTakingV2Router.post(
  "/:testId/section/:index/start",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId, index } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const result = await testAttemptService.startSection(
        testId,
        studentId,
        parseInt(index, 10)
      );
      return res.ok("section started", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/tests/:testId/section/:index/status
testTakingV2Router.get(
  "/:testId/section/:index/status",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { testId, index } = req.params;
      const studentId = req.auth?.studentId || req.auth?.sub || "";
      const status = await testAttemptService.getSectionStatus(
        testId,
        studentId,
        parseInt(index, 10)
      );
      return res.ok("section status", status);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
