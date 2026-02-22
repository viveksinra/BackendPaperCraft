import { Router, Request, Response } from "express";
import path from "path";
import { updateStudentProfileSchema } from "../../../shared/validation/studentValidation";
import { isStudent } from "../../../shared/middleware/roleGuards";
import {
  getStudentProfile,
  updateStudentProfile,
  getStudentDashboard,
  getStudentTests,
  getStudentResults,
  getStudentResultDetail,
  getStudentPerformance,
} from "../../../services/studentService";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const studentV2Router = Router();
studentV2Router.use(ensureAuth, isStudent);

// Helper: resolve userId from auth email
async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// GET /api/v2/student/profile
studentV2Router.get("/profile", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const profile = await getStudentProfile(userId);
    return res.ok("student profile", { profile });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get profile", "error");
  }
});

// PATCH /api/v2/student/profile
studentV2Router.patch("/profile", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateStudentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const userId = await resolveUserId(req);
    const profile = await updateStudentProfile(userId, parsed.data);
    return res.ok("profile updated", { profile });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to update profile", "error");
  }
});

// GET /api/v2/student/dashboard
studentV2Router.get("/dashboard", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const dashboard = await getStudentDashboard(userId);
    return res.ok("student dashboard", dashboard);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get dashboard", "error");
  }
});

// GET /api/v2/student/tests
studentV2Router.get("/tests", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const filters = {
      status: req.query.status as "upcoming" | "available" | "completed" | undefined,
      mode: req.query.mode as string | undefined,
      orgId: req.query.orgId as string | undefined,
    };
    const pagination = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };
    const result = await getStudentTests(userId, filters, pagination);
    return res.ok("student tests", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get tests", "error");
  }
});

// GET /api/v2/student/results
studentV2Router.get("/results", async (req: AuthedRequest, res: Response) => {
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
    const result = await getStudentResults(userId, filters, pagination);
    return res.ok("student results", result);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get results", "error");
  }
});

// GET /api/v2/student/results/:testId
studentV2Router.get("/results/:testId", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const result = await getStudentResultDetail(userId, req.params.testId);
    return res.ok("result detail", { result });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get result", "error");
  }
});

// GET /api/v2/student/results/:testId/:attemptNumber
studentV2Router.get("/results/:testId/:attemptNumber", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const attemptNumber = parseInt(req.params.attemptNumber);
    const result = await getStudentResultDetail(userId, req.params.testId, attemptNumber);
    return res.ok("result detail", { result });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get result", "error");
  }
});

// GET /api/v2/student/performance
studentV2Router.get("/performance", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const orgId = req.query.orgId as string | undefined;
    const performance = await getStudentPerformance(userId, orgId);
    return res.ok("student performance", performance);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get performance", "error");
  }
});

// GET /api/v2/student/performance/:orgId
studentV2Router.get("/performance/:orgId", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const performance = await getStudentPerformance(userId, req.params.orgId);
    return res.ok("student performance", performance);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to get performance", "error");
  }
});
