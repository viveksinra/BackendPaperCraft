import { Router, Request, Response } from "express";
import path from "path";
import { linkChildSchema } from "../../../shared/validation/parentValidation";
import { isParent, isParentOf } from "../../../shared/middleware/roleGuards";
import {
  linkChild,
  unlinkChild,
  getLinkedChildren,
  getParentDashboard,
  getChildTests,
  getChildResults,
  getChildResultDetail,
  getChildPerformance,
} from "../../../services/parentService";
import * as homeworkService from "../../../services/homeworkService";
import * as feeService from "../../../services/feeService";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string }; parentLink?: any };

export const parentV2Router = Router();
parentV2Router.use(ensureAuth);

// Helper: resolve userId from auth email
async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// POST /api/v2/parent/link-child
parentV2Router.post("/link-child", isParent, async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = linkChildSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const userId = await resolveUserId(req);
    const result = await linkChild(userId, parsed.data.studentCode, parsed.data.relationship);
    return res.ok("child linked", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to link child", "error");
  }
});

// POST /api/v2/parent/unlink-child/:studentUserId
parentV2Router.post("/unlink-child/:studentUserId", isParent, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const link = await unlinkChild(userId, req.params.studentUserId);
    return res.ok("child unlinked", { link });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to unlink child", "error");
  }
});

// GET /api/v2/parent/children
parentV2Router.get("/children", isParent, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const children = await getLinkedChildren(userId);
    return res.ok("linked children", { children });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get children", "error");
  }
});

// GET /api/v2/parent/dashboard
parentV2Router.get("/dashboard", isParent, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const dashboard = await getParentDashboard(userId);
    return res.ok("parent dashboard", dashboard);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get dashboard", "error");
  }
});

// GET /api/v2/parent/children/:childId/tests
parentV2Router.get("/children/:childId/tests", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const filters = {
      status: req.query.status as string | undefined,
      mode: req.query.mode as string | undefined,
      orgId: req.query.orgId as string | undefined,
    };
    const pagination = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };
    const result = await getChildTests(userId, req.params.childId, filters, pagination);
    return res.ok("child tests", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child tests", "error");
  }
});

// GET /api/v2/parent/children/:childId/results
parentV2Router.get("/children/:childId/results", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const filters = {
      orgId: req.query.orgId as string | undefined,
      dateRange: req.query.from || req.query.to
        ? { from: req.query.from as string, to: req.query.to as string }
        : undefined,
      subject: req.query.subject as string | undefined,
    };
    const pagination = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };
    const result = await getChildResults(userId, req.params.childId, filters, pagination);
    return res.ok("child results", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child results", "error");
  }
});

// GET /api/v2/parent/children/:childId/results/:testId
parentV2Router.get("/children/:childId/results/:testId", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const result = await getChildResultDetail(userId, req.params.childId, req.params.testId);
    return res.ok("child result detail", { result });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child result", "error");
  }
});

// GET /api/v2/parent/children/:childId/performance
parentV2Router.get("/children/:childId/performance", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const orgId = req.query.orgId as string | undefined;
    const performance = await getChildPerformance(userId, req.params.childId, orgId);
    return res.ok("child performance", performance);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child performance", "error");
  }
});

// GET /api/v2/parent/children/:childId/performance/:orgId
parentV2Router.get("/children/:childId/performance/:orgId", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const performance = await getChildPerformance(userId, req.params.childId, req.params.orgId);
    return res.ok("child performance", performance);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child performance", "error");
  }
});

// ─── Phase 5: Child Homework & Fees ─────────────────────────────────────────

// GET /api/v2/parent/children/:childId/homework
parentV2Router.get("/children/:childId/homework", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await homeworkService.getStudentHomework(
      req.params.childId,
      {
        status: req.query.status as string,
        classId: req.query.classId as string,
      },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }
    );
    return res.ok("child homework", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child homework", "error");
  }
});

// GET /api/v2/parent/children/:childId/homework/:hwId
parentV2Router.get("/children/:childId/homework/:hwId", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await homeworkService.getStudentHomeworkDetail(
      req.params.childId,
      req.params.hwId
    );
    return res.ok("child homework detail", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child homework detail", "error");
  }
});

// GET /api/v2/parent/children/:childId/fees
parentV2Router.get("/children/:childId/fees", isParent, isParentOf, async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const fees = await feeService.getChildFees(userId, req.params.childId);
    return res.ok("child fees", { fees });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get child fees", "error");
  }
});
