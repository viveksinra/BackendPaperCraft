import { Router, Request, Response } from "express";
import path from "path";
import { isStudent, isParent } from "../../../shared/middleware/roleGuards";
import * as purchaseService from "../../../services/purchaseService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const purchasesV2Router = Router();

// Helper: resolve userId from auth email
async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// GET /api/v2/student/purchases
purchasesV2Router.get(
  "/student/purchases",
  ensureAuth,
  isStudent,
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = await resolveUserId(req);
      const { status, productType, page, pageSize } = req.query as Record<string, string>;
      const result = await purchaseService.getStudentPurchases(
        userId,
        { status, productType },
        { page: page ? Number(page) : undefined, limit: pageSize ? Number(pageSize) : undefined }
      );
      return res.ok("student purchases", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/parent/purchases
purchasesV2Router.get(
  "/parent/purchases",
  ensureAuth,
  isParent,
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = await resolveUserId(req);
      const { status, productType, page, pageSize } = req.query as Record<string, string>;
      const result = await purchaseService.getParentPurchases(
        userId,
        { status, productType },
        { page: page ? Number(page) : undefined, limit: pageSize ? Number(pageSize) : undefined }
      );
      return res.ok("parent purchases", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);

// GET /api/v2/student/access/:referenceType/:referenceId
purchasesV2Router.get(
  "/student/access/:referenceType/:referenceId",
  ensureAuth,
  isStudent,
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = await resolveUserId(req);
      const { referenceType, referenceId } = req.params;
      const result = await purchaseService.hasAccess(userId, referenceType, referenceId);
      return res.ok("access check", result);
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
