import { Router, Request, Response } from "express";
import path from "path";
import { isStudent } from "../../../shared/middleware/roleGuards";
import * as announcementService from "../../../services/announcementService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const studentAnnouncementsV2Router = Router();
studentAnnouncementsV2Router.use(ensureAuth, isStudent);

// Helper: resolve userId from auth email
async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// ─── GET / — List student's announcements ───────────────────────────────────

studentAnnouncementsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const companyId = req.query.companyId as string;
    if (!companyId) {
      return res.status(400).sendEnvelope("companyId query parameter required", "error");
    }
    const result = await announcementService.getStudentAnnouncements(
      userId,
      companyId,
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }
    );
    return res.ok("student announcements", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
