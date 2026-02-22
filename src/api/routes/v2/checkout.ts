import { Router, Request, Response } from "express";
import path from "path";
import {
  createCheckoutSessionSchema,
  freeAccessSchema,
} from "../../../shared/validation/checkoutValidation";
import * as checkoutService from "../../../services/checkoutService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const checkoutV2Router = Router();
checkoutV2Router.use(ensureAuth);

// Helper: resolve userId and role
async function resolveUserContext(req: AuthedRequest): Promise<{
  userId: string;
  role: "student" | "parent";
}> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });

  // Determine role from membership context or default to student
  const Membership = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Membership"));
  const membership = await Membership.findOne({ userEmail: email, role: { $in: ["student", "parent"] } });
  const role = membership?.role === "parent" ? "parent" : "student";

  return { userId: user._id.toString(), role: role as "student" | "parent" };
}

// POST /api/v2/checkout/create-session
checkoutV2Router.post("/create-session", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createCheckoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const { userId, role } = await resolveUserContext(req);
    const { productId, studentUserId, selectedAddOns } = parsed.data;

    // For students, studentUserId is themselves
    const finalStudentUserId = role === "parent" ? studentUserId || userId : userId;

    const result = await checkoutService.createCheckoutSession(
      userId,
      role,
      finalStudentUserId,
      productId,
      selectedAddOns
    );
    return res.ok("checkout session created", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/checkout/verify/:sessionId
checkoutV2Router.get("/verify/:sessionId", async (req: AuthedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const result = await checkoutService.verifyCheckoutSession(sessionId);
    return res.ok("checkout session verified", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/checkout/free-access
checkoutV2Router.post("/free-access", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = freeAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }

    const { userId, role } = await resolveUserContext(req);
    const { productId, studentUserId } = parsed.data;

    const finalStudentUserId = role === "parent" ? studentUserId || userId : userId;

    const purchase = await checkoutService.handleFreeAccess(
      userId,
      role,
      finalStudentUserId,
      productId
    );
    return res.ok("free access granted", { purchase });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
