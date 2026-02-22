import { Router, Request, Response } from "express";
import { parentSignupSchema } from "../../../shared/validation/parentValidation";
import { registerParent } from "../../../services/parentService";

export const parentAuthV2Router = Router();

// POST /api/v2/auth/parent/signup (public)
parentAuthV2Router.post("/signup", async (req: Request, res: Response) => {
  try {
    const parsed = parentSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }

    const { email, password, name } = parsed.data;
    const result = await registerParent(email, password, name);

    return res.status(201).json({
      message: "parent registered",
      variant: "success",
      myData: {
        user: result.user,
        accessToken: result.token,
      },
      user: result.user,
      accessToken: result.token,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).sendEnvelope(error.message || "registration failed", "error");
  }
});
