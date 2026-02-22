import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import {
  sendMessageSchema,
  getConversationMessagesSchema,
  listConversationsSchema,
  searchMessagesSchema,
  markConversationReadSchema,
} from "../../../shared/validation/messageValidation";
import * as messageService from "../../../services/messageService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string; role?: string };
};

export const messagesV2Router = Router({ mergeParams: true });
messagesV2Router.use(ensureAuth, requireCompanyContext);

// POST /api/v2/companies/:companyId/messages — Send a message
messagesV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const senderId = req.auth?.userId || "";
    const senderRole = (req.auth?.role || "teacher") as any;

    const message = await messageService.sendMessage(tenantId, companyId, {
      senderId,
      senderRole,
      ...parsed.data,
    });
    return res.status(201).sendEnvelope("message sent", "success", { message });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/messages/conversations — List conversations
messagesV2Router.get("/conversations", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = listConversationsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const result = await messageService.getConversations(
      tenantId,
      companyId,
      userId,
      parsed.data
    );
    return res.ok("conversations", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/messages/conversation/:otherUserId — Get conversation messages
messagesV2Router.get("/conversation/:otherUserId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, otherUserId } = req.params;
    const userId = req.auth?.userId || "";
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;

    const result = await messageService.getConversationMessages(
      tenantId,
      companyId,
      userId,
      otherUserId,
      { page, pageSize }
    );
    return res.ok("messages", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/messages/conversation/:otherUserId/read — Mark conversation as read
messagesV2Router.post("/conversation/:otherUserId/read", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, otherUserId } = req.params;
    const userId = req.auth?.userId || "";

    const count = await messageService.markConversationAsRead(
      tenantId,
      companyId,
      userId,
      otherUserId
    );
    return res.ok("conversation marked as read", { markedCount: count });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/messages/:messageId/read — Mark single message as read
messagesV2Router.patch("/:messageId/read", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, messageId } = req.params;
    const userId = req.auth?.userId || "";

    const message = await messageService.markMessageAsRead(tenantId, companyId, userId, messageId);
    return res.ok("message marked as read", { message });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/messages/:messageId — Delete message
messagesV2Router.delete("/:messageId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, messageId } = req.params;
    const userId = req.auth?.userId || "";

    await messageService.deleteMessage(tenantId, companyId, userId, messageId);
    return res.ok("message deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/messages/unread-count — Get unread count
messagesV2Router.get("/unread-count", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const count = await messageService.getUnreadCount(tenantId, companyId, userId);
    return res.ok("unread count", { count });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/messages/search — Search messages
messagesV2Router.get("/search", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = searchMessagesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";

    const result = await messageService.searchMessages(
      tenantId,
      companyId,
      userId,
      parsed.data.query,
      { page: parsed.data.page, pageSize: parsed.data.pageSize }
    );
    return res.ok("search results", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/messages/sent — Get sent messages
messagesV2Router.get("/sent", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;
    const userId = req.auth?.userId || "";
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const result = await messageService.getSentMessages(tenantId, companyId, userId, {
      page,
      pageSize,
    });
    return res.ok("sent messages", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
