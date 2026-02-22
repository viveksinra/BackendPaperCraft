import { Router, Request, Response } from "express";
import path from "path";
import { studentSignupSchema, joinOrgSchema } from "../../../shared/validation/studentValidation";
import { registerStudent, joinOrganization } from "../../../services/studentService";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { auth?: { sub?: string } };

export const studentAuthV2Router = Router();

// POST /api/v2/auth/student/signup (public)
studentAuthV2Router.post("/signup", async (req: Request, res: Response) => {
  try {
    const parsed = studentSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }

    const { email, password, name, orgCode } = parsed.data;
    const result = await registerStudent(email, password, name, orgCode);

    return res.status(201).json({
      message: "student registered",
      variant: "success",
      myData: {
        user: result.user,
        student: result.student,
        accessToken: result.token,
      },
      user: result.user,
      student: result.student,
      accessToken: result.token,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "registration failed", "error");
  }
});

// POST /api/v2/auth/student/join-org (authenticated)
studentAuthV2Router.post("/join-org", ensureAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = joinOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }

    const email = req.auth?.sub;
    if (!email) {
      return res.status(401).sendEnvelope("authentication required", "error");
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).sendEnvelope("user not found", "error");
    }

    const student = await joinOrganization(user._id, parsed.data.orgCode);
    return res.ok("joined organization", { student });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "failed to join organization", "error");
  }
});
