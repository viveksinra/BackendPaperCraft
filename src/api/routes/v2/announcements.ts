import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { createAnnouncementSchema } from "../../../shared/validation/announcementValidation";
import * as announcementService from "../../../services/announcementService";

const legacyAuth = require(
  path.join(__dirname, "..", "..", "..", "..", "utils", "auth")
);
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const announcementsV2Router = Router({ mergeParams: true });
announcementsV2Router.use(ensureAuth, requireCompanyContext);

// ─── GET / — List announcements ─────────────────────────────────────────────

announcementsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const result = await announcementService.listAnnouncements(
      companyId,
      {
        audience: req.query.audience as string,
        classId: req.query.classId as string,
        isPinned: req.query.isPinned === "true" ? true : undefined,
      },
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }
    );
    return res.ok("announcements listed", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── POST / — Create announcement ──────────────────────────────────────────

announcementsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).sendEnvelope(
        parsed.error.issues.map((e: { message: string }) => e.message).join(", "),
        "error"
      );
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const ann = await announcementService.createAnnouncement(
      companyId,
      tenantId,
      parsed.data as Record<string, unknown>,
      userEmail
    );
    return res.ok("announcement created", { announcement: ann });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── DELETE /:id — Delete announcement ──────────────────────────────────────

announcementsV2Router.delete("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    await announcementService.deleteAnnouncement(companyId, id);
    return res.ok("announcement deleted", {});
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// ─── PATCH /:id/pin — Pin/unpin announcement ───────────────────────────────

announcementsV2Router.patch("/:id/pin", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const isPinned = Boolean(req.body.isPinned);
    const ann = await announcementService.pinAnnouncement(
      companyId,
      id,
      isPinned,
      userEmail
    );
    return res.ok("announcement updated", { announcement: ann });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
