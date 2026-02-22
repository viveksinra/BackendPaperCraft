import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  createThreadSchema,
  updateThreadSchema,
  createReplySchema,
  editReplySchema,
  listThreadsSchema,
  listRepliesSchema,
} from "../../../shared/validation/discussionValidation";
import * as discussionService from "../../../services/discussionService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; userId?: string; role?: string; name?: string };
};

export const discussionsV2Router = Router({ mergeParams: true });
discussionsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/discussions — List threads
discussionsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = listThreadsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const result = await discussionService.listThreads(tenantId, companyId, parsed.data);
    return res.ok("threads", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions — Create thread
discussionsV2Router.post("/", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const thread = await discussionService.createThread(tenantId, companyId, {
      ...parsed.data,
      authorId: req.auth?.userId || "",
      authorRole: (req.auth?.role || "teacher") as any,
      authorName: req.auth?.name || req.auth?.sub || "User",
    });
    return res.status(201).sendEnvelope("thread created", "success", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/discussions/:threadId — Get thread
discussionsV2Router.get("/:threadId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const thread = await discussionService.getThreadById(tenantId, companyId, threadId);
    return res.ok("thread", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/discussions/:threadId — Update thread
discussionsV2Router.patch("/:threadId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;
    const userId = req.auth?.userId || "";

    const thread = await discussionService.updateThread(
      tenantId,
      companyId,
      threadId,
      userId,
      parsed.data
    );
    return res.ok("thread updated", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/discussions/:threadId — Delete thread
discussionsV2Router.delete("/:threadId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;
    const userId = req.auth?.userId || "";
    const userRole = req.auth?.role || "teacher";

    await discussionService.deleteThread(tenantId, companyId, threadId, userId, userRole);
    return res.ok("thread deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/upvote — Toggle upvote
discussionsV2Router.post("/:threadId/upvote", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;
    const userId = req.auth?.userId || "";

    const thread = await discussionService.upvoteThread(tenantId, companyId, threadId, userId);
    return res.ok("upvote toggled", { upvoteCount: thread.upvoteCount });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/flag — Flag thread
discussionsV2Router.post("/:threadId/flag", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;
    const userId = req.auth?.userId || "";

    await discussionService.flagThread(tenantId, companyId, threadId, userId);
    return res.ok("thread flagged");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/lock — Lock thread (teacher/admin)
discussionsV2Router.post("/:threadId/lock", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const thread = await discussionService.lockThread(tenantId, companyId, threadId);
    return res.ok("thread locked", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/unlock — Unlock thread
discussionsV2Router.post("/:threadId/unlock", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const thread = await discussionService.unlockThread(tenantId, companyId, threadId);
    return res.ok("thread unlocked", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/pin — Pin thread
discussionsV2Router.post("/:threadId/pin", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const thread = await discussionService.pinThread(tenantId, companyId, threadId);
    return res.ok("thread pinned", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/unpin — Unpin thread
discussionsV2Router.post("/:threadId/unpin", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const thread = await discussionService.unpinThread(tenantId, companyId, threadId);
    return res.ok("thread unpinned", { thread });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/discussions/:threadId/replies — Get replies
discussionsV2Router.get("/:threadId/replies", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = listRepliesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const result = await discussionService.getReplies(
      tenantId,
      companyId,
      threadId,
      parsed.data
    );
    return res.ok("replies", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/replies — Create reply
discussionsV2Router.post("/:threadId/replies", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId } = req.params;

    const reply = await discussionService.createReply(tenantId, companyId, threadId, {
      ...parsed.data,
      authorId: req.auth?.userId || "",
      authorRole: (req.auth?.role || "teacher") as any,
      authorName: req.auth?.name || req.auth?.sub || "User",
    });
    return res.status(201).sendEnvelope("reply created", "success", { reply });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/discussions/replies/:replyId — Edit reply
discussionsV2Router.patch("/replies/:replyId", async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = editReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const tenantId = req.tenantId || "devTenant";
    const { companyId, replyId } = req.params;
    const userId = req.auth?.userId || "";

    const reply = await discussionService.editReply(
      tenantId,
      companyId,
      replyId,
      userId,
      parsed.data.body
    );
    return res.ok("reply updated", { reply });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/discussions/replies/:replyId — Delete reply
discussionsV2Router.delete("/replies/:replyId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, replyId } = req.params;
    const userId = req.auth?.userId || "";
    const userRole = req.auth?.role || "teacher";

    await discussionService.deleteReply(tenantId, companyId, replyId, userId, userRole);
    return res.ok("reply deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/replies/:replyId/upvote — Toggle reply upvote
discussionsV2Router.post("/replies/:replyId/upvote", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, replyId } = req.params;
    const userId = req.auth?.userId || "";

    const reply = await discussionService.upvoteReply(tenantId, companyId, replyId, userId);
    return res.ok("upvote toggled", { upvoteCount: reply.upvoteCount });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/replies/:replyId/flag — Flag reply
discussionsV2Router.post("/replies/:replyId/flag", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, replyId } = req.params;
    const userId = req.auth?.userId || "";

    await discussionService.flagReply(tenantId, companyId, replyId, userId);
    return res.ok("reply flagged");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/discussions/:threadId/accept/:replyId — Accept answer
discussionsV2Router.post("/:threadId/accept/:replyId", async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId, threadId, replyId } = req.params;
    const userId = req.auth?.userId || "";

    const reply = await discussionService.acceptAnswer(tenantId, companyId, threadId, replyId, userId);
    return res.ok("answer accepted", { reply });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/discussions/flagged — Get flagged content (moderation)
discussionsV2Router.get("/moderation/flagged", ensureRole("teacher"), async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || "devTenant";
    const { companyId } = req.params;

    const result = await discussionService.getFlaggedContent(tenantId, companyId);
    return res.ok("flagged content", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
