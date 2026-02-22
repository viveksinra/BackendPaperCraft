import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  listNotificationsSchema,
  markAllReadSchema,
} from "../../../shared/validation/notificationValidation";
import * as notificationService from "../../../services/notificationService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string };
};

export const notificationsV2Router = Router({ mergeParams: true });
notificationsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/notifications — List notifications
notificationsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = listNotificationsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const result = await notificationService.getNotifications(
      tenantId,
      companyId,
      userId,
      {
        category: parsed.data.category as any,
        isRead: parsed.data.isRead === "true" ? true : parsed.data.isRead === "false" ? false : undefined,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }
    );
    return res.ok("notifications", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/notifications/unread-count — Get unread count
notificationsV2Router.get("/unread-count", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const count = await notificationService.getUnreadCount(tenantId, companyId, userId);
    return res.ok("unread count", { count });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/notifications/:notificationId/read — Mark as read
notificationsV2Router.patch("/:notificationId/read", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, notificationId } = req.params;
    const userId = req.auth?.userId || "";

    const notification = await notificationService.markAsRead(
      tenantId,
      companyId,
      userId,
      notificationId
    );
    return res.ok("marked as read", { notification });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/notifications/read-all — Mark all as read
notificationsV2Router.post("/read-all", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = markAllReadSchema.safeParse(req.body);
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const count = await notificationService.markAllAsRead(
      tenantId,
      companyId,
      userId,
      parsed.success ? (parsed.data.category as any) : undefined
    );
    return res.ok("all marked as read", { count });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/notifications/:notificationId — Archive notification
notificationsV2Router.delete("/:notificationId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, notificationId } = req.params;
    const userId = req.auth?.userId || "";

    await notificationService.archiveNotification(tenantId, companyId, userId, notificationId);
    return res.ok("notification archived");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
