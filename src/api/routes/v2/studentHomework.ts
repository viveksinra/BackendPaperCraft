import { Router, Request, Response } from "express";
import path from "path";
import { isStudent } from "../../../shared/middleware/roleGuards";
import { submitHomeworkSchema } from "../../../shared/validation/homeworkValidation";
import * as homeworkService from "../../../services/homeworkService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const studentHomeworkV2Router = Router();
studentHomeworkV2Router.use(ensureAuth, isStudent);

// Helper: resolve userId from auth email
async function resolveUserId(req: AuthedRequest): Promise<string> {
  const email = req.auth?.sub;
  if (!email) throw Object.assign(new Error("authentication required"), { status: 401 });
  const user = await User.findOne({ email });
  if (!user) throw Object.assign(new Error("user not found"), { status: 404 });
  return user._id.toString();
}

// ─── GET / — List student's homework ────────────────────────────────────────

studentHomeworkV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const result = await homeworkService.getStudentHomework(
      userId,
      {
        status: req.query.status as string,
        classId: req.query.classId as string,
      },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }
    );
    return res.ok("student homework", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── GET /:homeworkId — Get homework detail ─────────────────────────────────

studentHomeworkV2Router.get("/:homeworkId", async (req: AuthedRequest, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const result = await homeworkService.getStudentHomeworkDetail(
      userId,
      req.params.homeworkId
    );
    return res.ok("homework detail", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST /:homeworkId/submit — Submit homework ─────────────────────────────

studentHomeworkV2Router.post(
  "/:homeworkId/submit",
  async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = submitHomeworkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).sendEnvelope(
          parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
          "error"
        );
      }
      const userId = await resolveUserId(req);
      const submission = await homeworkService.submitHomework(
        userId,
        req.params.homeworkId,
        parsed.data.answers
      );
      return res.ok("homework submitted", { submission });
    } catch (err: any) {
      return res.status(err.status || 500).sendEnvelope(err.message, "error");
    }
  }
);
