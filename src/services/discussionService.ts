import { Types } from "mongoose";
import {
  DiscussionThreadModel,
  DiscussionThreadDocument,
  ThreadCategory,
} from "../models/discussionThread";
import {
  DiscussionReplyModel,
  DiscussionReplyDocument,
} from "../models/discussionReply";
import * as gamificationService from "./gamificationService";
import * as notificationService from "./notificationService";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// ─── 1. Create Thread ──────────────────────────────────────────────────────

export async function createThread(
  tenantId: string,
  companyId: string,
  input: {
    title: string;
    body: string;
    category?: string;
    tags?: string[];
    authorId: string;
    authorRole: "teacher" | "student" | "parent" | "admin";
    authorName: string;
    classId?: string;
    courseId?: string;
  }
): Promise<DiscussionThreadDocument> {
  const thread = await DiscussionThreadModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    classId: input.classId ? toObjectId(input.classId) : null,
    courseId: input.courseId ? toObjectId(input.courseId) : null,
    title: input.title,
    body: input.body,
    category: input.category || "general",
    tags: input.tags || [],
    authorId: toObjectId(input.authorId),
    authorRole: input.authorRole,
    authorName: input.authorName,
  });

  // Award gamification points for creating a discussion post
  if (input.authorRole === "student") {
    try {
      await gamificationService.awardPoints(
        tenantId,
        companyId,
        input.authorId,
        "discussion_post",
        {
          description: "Created a discussion thread",
          referenceType: "discussion_thread",
          referenceId: String(thread._id),
        }
      );
    } catch (err) {
      logger.warn({ msg: "Failed to award discussion post points", err });
    }
  }

  logger.info({
    msg: "Discussion thread created",
    threadId: String(thread._id),
    authorId: input.authorId,
  });

  return thread;
}

// ─── 2. List Threads ───────────────────────────────────────────────────────

interface ListThreadParams {
  category?: string;
  classId?: string;
  courseId?: string;
  authorId?: string;
  status?: string;
  search?: string;
  sortBy?: "newest" | "popular" | "most_replies" | "most_upvotes";
  page?: number;
  pageSize?: number;
}

export async function listThreads(
  tenantId: string,
  companyId: string,
  params: ListThreadParams = {}
): Promise<{ threads: DiscussionThreadDocument[]; total: number }> {
  const {
    category,
    classId,
    courseId,
    authorId,
    status,
    search,
    sortBy = "newest",
    page = 1,
    pageSize = 20,
  } = params;

  const filter: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
  };

  if (category) filter.category = category;
  if (classId) filter.classId = toObjectId(classId);
  if (courseId) filter.courseId = toObjectId(courseId);
  if (authorId) filter.authorId = toObjectId(authorId);
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { body: { $regex: search, $options: "i" } },
    ];
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { isPinned: -1, createdAt: -1 },
    popular: { isPinned: -1, viewCount: -1 },
    most_replies: { isPinned: -1, replyCount: -1 },
    most_upvotes: { isPinned: -1, upvoteCount: -1 },
  };

  const [threads, total] = await Promise.all([
    DiscussionThreadModel.find(filter)
      .sort(sortMap[sortBy] || sortMap.newest)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DiscussionThreadModel.countDocuments(filter),
  ]);

  return { threads: threads as any as DiscussionThreadDocument[], total };
}

// ─── 3. Get Thread by ID ──────────────────────────────────────────────────

export async function getThreadById(
  tenantId: string,
  companyId: string,
  threadId: string,
  incrementView: boolean = true
): Promise<DiscussionThreadDocument> {
  const thread = incrementView
    ? await DiscussionThreadModel.findOneAndUpdate(
        {
          _id: toObjectId(threadId),
          tenantId,
          companyId: toObjectId(companyId),
        },
        { $inc: { viewCount: 1 } },
        { new: true }
      )
    : await DiscussionThreadModel.findOne({
        _id: toObjectId(threadId),
        tenantId,
        companyId: toObjectId(companyId),
      });

  if (!thread) {
    throw Object.assign(new Error("Thread not found"), { status: 404 });
  }
  return thread;
}

// ─── 4. Update Thread ──────────────────────────────────────────────────────

export async function updateThread(
  tenantId: string,
  companyId: string,
  threadId: string,
  userId: string,
  updates: {
    title?: string;
    body?: string;
    category?: string;
    tags?: string[];
  }
): Promise<DiscussionThreadDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  if (String(thread.authorId) !== userId) {
    throw Object.assign(new Error("Only the author can edit this thread"), {
      status: 403,
    });
  }

  if (updates.title) thread.title = updates.title;
  if (updates.body) thread.body = updates.body;
  if (updates.category) thread.category = updates.category as ThreadCategory;
  if (updates.tags) thread.tags = updates.tags;

  await thread.save();
  return thread;
}

// ─── 5. Delete Thread ──────────────────────────────────────────────────────

export async function deleteThread(
  tenantId: string,
  companyId: string,
  threadId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  const isAuthor = String(thread.authorId) === userId;
  const isModerator = ["teacher", "admin"].includes(userRole);

  if (!isAuthor && !isModerator) {
    throw Object.assign(new Error("Not authorized to delete this thread"), {
      status: 403,
    });
  }

  await DiscussionReplyModel.deleteMany({ threadId: thread._id });
  await DiscussionThreadModel.deleteOne({ _id: thread._id });

  logger.info({ msg: "Thread deleted", threadId });
}

// ─── 6. Create Reply ──────────────────────────────────────────────────────

export async function createReply(
  tenantId: string,
  companyId: string,
  threadId: string,
  input: {
    body: string;
    authorId: string;
    authorRole: "teacher" | "student" | "parent" | "admin";
    authorName: string;
    parentReplyId?: string;
  }
): Promise<DiscussionReplyDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  if (thread.isLocked) {
    throw Object.assign(new Error("Thread is locked"), { status: 403 });
  }

  const reply = await DiscussionReplyModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    threadId: toObjectId(threadId),
    parentReplyId: input.parentReplyId
      ? toObjectId(input.parentReplyId)
      : null,
    authorId: toObjectId(input.authorId),
    authorRole: input.authorRole,
    authorName: input.authorName,
    body: input.body,
  });

  // Update thread stats
  thread.replyCount += 1;
  thread.lastReplyAt = new Date();
  thread.lastReplyBy = toObjectId(input.authorId);
  await thread.save();

  // Notify thread author (if not self-reply)
  if (String(thread.authorId) !== input.authorId) {
    await notificationService.createNotification({
      tenantId,
      companyId,
      recipientId: String(thread.authorId),
      type: "discussion_reply",
      title: "New Reply",
      body: `${input.authorName} replied to your thread: ${thread.title}`,
      actionUrl: `/discussions/${threadId}`,
      referenceType: "discussion_reply",
      referenceId: String(reply._id),
    });
  }

  // Notify parent reply author (if nested reply)
  if (input.parentReplyId) {
    const parentReply = await DiscussionReplyModel.findById(
      toObjectId(input.parentReplyId)
    );
    if (
      parentReply &&
      String(parentReply.authorId) !== input.authorId &&
      String(parentReply.authorId) !== String(thread.authorId)
    ) {
      await notificationService.createNotification({
        tenantId,
        companyId,
        recipientId: String(parentReply.authorId),
        type: "discussion_reply",
        title: "New Reply",
        body: `${input.authorName} replied to your comment`,
        actionUrl: `/discussions/${threadId}`,
        referenceType: "discussion_reply",
        referenceId: String(reply._id),
      });
    }
  }

  // Award gamification points
  if (input.authorRole === "student") {
    try {
      await gamificationService.awardPoints(
        tenantId,
        companyId,
        input.authorId,
        "discussion_reply",
        {
          description: "Replied to a discussion",
          referenceType: "discussion_reply",
          referenceId: String(reply._id),
        }
      );
    } catch (err) {
      logger.warn({ msg: "Failed to award discussion reply points", err });
    }
  }

  return reply;
}

// ─── 7. Get Replies ────────────────────────────────────────────────────────

export async function getReplies(
  tenantId: string,
  companyId: string,
  threadId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ replies: DiscussionReplyDocument[]; total: number }> {
  const { page = 1, pageSize = 50 } = params;

  const filter = {
    threadId: toObjectId(threadId),
    tenantId,
    companyId: toObjectId(companyId),
    isDeleted: false,
  };

  const [replies, total] = await Promise.all([
    DiscussionReplyModel.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DiscussionReplyModel.countDocuments(filter),
  ]);

  return { replies: replies as any as DiscussionReplyDocument[], total };
}

// ─── 8. Edit Reply ─────────────────────────────────────────────────────────

export async function editReply(
  tenantId: string,
  companyId: string,
  replyId: string,
  userId: string,
  body: string
): Promise<DiscussionReplyDocument> {
  const reply = await DiscussionReplyModel.findOne({
    _id: toObjectId(replyId),
    tenantId,
    companyId: toObjectId(companyId),
  });

  if (!reply) {
    throw Object.assign(new Error("Reply not found"), { status: 404 });
  }
  if (String(reply.authorId) !== userId) {
    throw Object.assign(new Error("Only the author can edit"), { status: 403 });
  }

  reply.body = body;
  reply.isEdited = true;
  reply.editedAt = new Date();
  await reply.save();
  return reply;
}

// ─── 9. Delete Reply (Soft) ───────────────────────────────────────────────

export async function deleteReply(
  tenantId: string,
  companyId: string,
  replyId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const reply = await DiscussionReplyModel.findOne({
    _id: toObjectId(replyId),
    tenantId,
    companyId: toObjectId(companyId),
  });

  if (!reply) {
    throw Object.assign(new Error("Reply not found"), { status: 404 });
  }

  const isAuthor = String(reply.authorId) === userId;
  const isModerator = ["teacher", "admin"].includes(userRole);

  if (!isAuthor && !isModerator) {
    throw Object.assign(new Error("Not authorized"), { status: 403 });
  }

  reply.isDeleted = true;
  reply.deletedAt = new Date();
  reply.deletedBy = toObjectId(userId);
  await reply.save();

  // Decrement thread reply count
  await DiscussionThreadModel.findByIdAndUpdate(reply.threadId, {
    $inc: { replyCount: -1 },
  });
}

// ─── 10. Upvote Thread ────────────────────────────────────────────────────

export async function upvoteThread(
  tenantId: string,
  companyId: string,
  threadId: string,
  userId: string
): Promise<DiscussionThreadDocument> {
  const userOid = toObjectId(userId);
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  const alreadyUpvoted = thread.upvotedBy.some((id) => id.equals(userOid));
  if (alreadyUpvoted) {
    // Remove upvote (toggle)
    thread.upvotedBy = thread.upvotedBy.filter((id) => !id.equals(userOid));
    thread.upvoteCount = Math.max(0, thread.upvoteCount - 1);
  } else {
    thread.upvotedBy.push(userOid);
    thread.upvoteCount += 1;
  }

  await thread.save();
  return thread;
}

// ─── 11. Upvote Reply ─────────────────────────────────────────────────────

export async function upvoteReply(
  tenantId: string,
  companyId: string,
  replyId: string,
  userId: string
): Promise<DiscussionReplyDocument> {
  const userOid = toObjectId(userId);
  const reply = await DiscussionReplyModel.findOne({
    _id: toObjectId(replyId),
    tenantId,
    companyId: toObjectId(companyId),
  });

  if (!reply) {
    throw Object.assign(new Error("Reply not found"), { status: 404 });
  }

  const alreadyUpvoted = reply.upvotedBy.some((id) => id.equals(userOid));
  if (alreadyUpvoted) {
    reply.upvotedBy = reply.upvotedBy.filter((id) => !id.equals(userOid));
    reply.upvoteCount = Math.max(0, reply.upvoteCount - 1);
  } else {
    reply.upvotedBy.push(userOid);
    reply.upvoteCount += 1;

    // Award gamification points to reply author
    if (String(reply.authorId) !== userId) {
      try {
        await gamificationService.awardPoints(
          tenantId,
          companyId,
          String(reply.authorId),
          "discussion_upvote_received",
          {
            description: "Received an upvote",
            referenceType: "discussion_reply",
            referenceId: String(reply._id),
          }
        );
      } catch (err) {
        logger.warn({ msg: "Failed to award upvote points", err });
      }
    }
  }

  await reply.save();
  return reply;
}

// ─── 12. Flag Content ──────────────────────────────────────────────────────

export async function flagThread(
  tenantId: string,
  companyId: string,
  threadId: string,
  userId: string
): Promise<DiscussionThreadDocument> {
  const userOid = toObjectId(userId);
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  if (!thread.flaggedBy.some((id) => id.equals(userOid))) {
    thread.flaggedBy.push(userOid);
    thread.flagCount += 1;
    await thread.save();
  }

  return thread;
}

export async function flagReply(
  tenantId: string,
  companyId: string,
  replyId: string,
  userId: string
): Promise<DiscussionReplyDocument> {
  const userOid = toObjectId(userId);
  const reply = await DiscussionReplyModel.findOne({
    _id: toObjectId(replyId),
    tenantId,
    companyId: toObjectId(companyId),
  });

  if (!reply) {
    throw Object.assign(new Error("Reply not found"), { status: 404 });
  }

  if (!reply.flaggedBy.some((id) => id.equals(userOid))) {
    reply.flaggedBy.push(userOid);
    reply.flagCount += 1;
    await reply.save();
  }

  return reply;
}

// ─── 13. Moderation Actions ───────────────────────────────────────────────

export async function lockThread(
  tenantId: string,
  companyId: string,
  threadId: string
): Promise<DiscussionThreadDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);
  thread.isLocked = true;
  await thread.save();
  return thread;
}

export async function unlockThread(
  tenantId: string,
  companyId: string,
  threadId: string
): Promise<DiscussionThreadDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);
  thread.isLocked = false;
  await thread.save();
  return thread;
}

export async function pinThread(
  tenantId: string,
  companyId: string,
  threadId: string
): Promise<DiscussionThreadDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);
  thread.isPinned = true;
  thread.status = "pinned";
  await thread.save();
  return thread;
}

export async function unpinThread(
  tenantId: string,
  companyId: string,
  threadId: string
): Promise<DiscussionThreadDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);
  thread.isPinned = false;
  thread.status = "open";
  await thread.save();
  return thread;
}

export async function acceptAnswer(
  tenantId: string,
  companyId: string,
  threadId: string,
  replyId: string,
  userId: string
): Promise<DiscussionReplyDocument> {
  const thread = await getThreadById(tenantId, companyId, threadId, false);

  if (String(thread.authorId) !== userId) {
    throw Object.assign(
      new Error("Only the thread author can accept an answer"),
      { status: 403 }
    );
  }

  // Unaccept any previously accepted answer
  await DiscussionReplyModel.updateMany(
    { threadId: thread._id, isAcceptedAnswer: true },
    { isAcceptedAnswer: false }
  );

  const reply = await DiscussionReplyModel.findOneAndUpdate(
    {
      _id: toObjectId(replyId),
      threadId: thread._id,
    },
    { isAcceptedAnswer: true },
    { new: true }
  );

  if (!reply) {
    throw Object.assign(new Error("Reply not found"), { status: 404 });
  }

  return reply;
}

// ─── 14. Get Flagged Content (Moderation Queue) ───────────────────────────

export async function getFlaggedContent(
  tenantId: string,
  companyId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{
  threads: DiscussionThreadDocument[];
  replies: DiscussionReplyDocument[];
}> {
  const { page = 1, pageSize = 20 } = params;
  const companyOid = toObjectId(companyId);

  const [threads, replies] = await Promise.all([
    DiscussionThreadModel.find({
      tenantId,
      companyId: companyOid,
      flagCount: { $gt: 0 },
    })
      .sort({ flagCount: -1 })
      .limit(pageSize)
      .lean(),
    DiscussionReplyModel.find({
      tenantId,
      companyId: companyOid,
      flagCount: { $gt: 0 },
      isDeleted: false,
    })
      .sort({ flagCount: -1 })
      .limit(pageSize)
      .lean(),
  ]);

  return {
    threads: threads as any as DiscussionThreadDocument[],
    replies: replies as any as DiscussionReplyDocument[],
  };
}
