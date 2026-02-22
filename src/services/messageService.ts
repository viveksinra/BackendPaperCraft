import { Types } from "mongoose";
import { MessageModel, MessageDocument } from "../models/message";
import * as notificationService from "./notificationService";
import { emitToUser } from "../shared/socket/socketServer";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

function buildConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join("_");
}

// ─── 1. Send Message ──────────────────────────────────────────────────────

export interface SendMessageInput {
  senderId: string;
  senderRole: "teacher" | "student" | "parent" | "admin";
  recipientId: string;
  recipientRole: "teacher" | "student" | "parent" | "admin";
  subject?: string;
  body: string;
  attachments?: Array<{
    name: string;
    url: string;
    fileSize: number;
    mimeType: string;
  }>;
  parentMessageId?: string;
}

export async function sendMessage(
  tenantId: string,
  companyId: string,
  input: SendMessageInput
): Promise<MessageDocument> {
  const senderOid = toObjectId(input.senderId);
  const recipientOid = toObjectId(input.recipientId);
  const companyOid = toObjectId(companyId);

  const conversationId = buildConversationId(input.senderId, input.recipientId);

  const message = await MessageModel.create({
    tenantId,
    companyId: companyOid,
    conversationId,
    senderId: senderOid,
    senderRole: input.senderRole,
    recipientId: recipientOid,
    recipientRole: input.recipientRole,
    subject: input.subject || "",
    body: input.body,
    attachments: input.attachments || [],
    parentMessageId: input.parentMessageId
      ? toObjectId(input.parentMessageId)
      : null,
    status: "sent",
  });

  // Emit real-time message event
  emitToUser(input.recipientId, "message:new", {
    messageId: String(message._id),
    senderId: input.senderId,
    senderRole: input.senderRole,
    subject: message.subject,
    body: message.body.substring(0, 200),
    createdAt: message.createdAt,
  });

  // Create notification
  await notificationService.createNotification({
    tenantId,
    companyId,
    recipientId: input.recipientId,
    type: "message_received",
    title: "New Message",
    body: input.subject
      ? `New message: ${input.subject}`
      : `You have a new message`,
    actionUrl: `/messages/${conversationId}`,
    referenceType: "message",
    referenceId: String(message._id),
  });

  logger.info({
    msg: "Message sent",
    messageId: String(message._id),
    senderId: input.senderId,
    recipientId: input.recipientId,
  });

  return message;
}

// ─── 2. Get Conversations ─────────────────────────────────────────────────

export async function getConversations(
  tenantId: string,
  companyId: string,
  userId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{
  conversations: Array<{
    conversationId: string;
    otherUserId: string;
    lastMessage: MessageDocument;
    unreadCount: number;
  }>;
  total: number;
}> {
  const { page = 1, pageSize = 20 } = params;
  const companyOid = toObjectId(companyId);
  const userOid = toObjectId(userId);

  // Get latest message per conversation for this user
  const pipeline = [
    {
      $match: {
        tenantId,
        companyId: companyOid,
        $or: [
          { senderId: userOid, deletedBySender: false },
          { recipientId: userOid, deletedByRecipient: false },
        ],
      },
    },
    { $sort: { createdAt: -1 as const } },
    {
      $group: {
        _id: "$conversationId",
        lastMessage: { $first: "$$ROOT" },
        unreadCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$recipientId", userOid] }, { $ne: ["$status", "read"] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { "lastMessage.createdAt": -1 as const } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
  ];

  const results = await MessageModel.aggregate(pipeline as any);

  const conversations = results.map((r: any) => ({
    conversationId: r._id,
    otherUserId: String(
      String(r.lastMessage.senderId) === userId
        ? r.lastMessage.recipientId
        : r.lastMessage.senderId
    ),
    lastMessage: r.lastMessage,
    unreadCount: r.unreadCount,
  }));

  // Get total conversation count
  const totalPipeline = [
    {
      $match: {
        tenantId,
        companyId: companyOid,
        $or: [
          { senderId: userOid, deletedBySender: false },
          { recipientId: userOid, deletedByRecipient: false },
        ],
      },
    },
    { $group: { _id: "$conversationId" } },
    { $count: "total" },
  ];
  const totalResult = await MessageModel.aggregate(totalPipeline);
  const total = totalResult[0]?.total || 0;

  return { conversations, total };
}

// ─── 3. Get Conversation Messages ──────────────────────────────────────────

export async function getConversationMessages(
  tenantId: string,
  companyId: string,
  userId: string,
  otherUserId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ messages: MessageDocument[]; total: number }> {
  const { page = 1, pageSize = 50 } = params;
  const companyOid = toObjectId(companyId);
  const conversationId = buildConversationId(userId, otherUserId);

  const filter: Record<string, unknown> = {
    tenantId,
    companyId: companyOid,
    conversationId,
    $or: [
      { senderId: toObjectId(userId), deletedBySender: false },
      { recipientId: toObjectId(userId), deletedByRecipient: false },
    ],
  };

  const [messages, total] = await Promise.all([
    MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MessageModel.countDocuments(filter),
  ]);

  return { messages: messages as any as MessageDocument[], total };
}

// ─── 4. Mark Message as Read ───────────────────────────────────────────────

export async function markMessageAsRead(
  tenantId: string,
  companyId: string,
  userId: string,
  messageId: string
): Promise<MessageDocument> {
  const message = await MessageModel.findOneAndUpdate(
    {
      _id: toObjectId(messageId),
      tenantId,
      companyId: toObjectId(companyId),
      recipientId: toObjectId(userId),
      status: { $ne: "read" },
    },
    { status: "read", readAt: new Date() },
    { new: true }
  );
  if (!message) {
    throw Object.assign(new Error("Message not found"), { status: 404 });
  }

  // Notify sender that message was read
  emitToUser(String(message.senderId), "message:read", {
    messageId: String(message._id),
    conversationId: message.conversationId,
    readAt: message.readAt,
  });

  return message;
}

// ─── 5. Mark Conversation as Read ──────────────────────────────────────────

export async function markConversationAsRead(
  tenantId: string,
  companyId: string,
  userId: string,
  otherUserId: string
): Promise<number> {
  const conversationId = buildConversationId(userId, otherUserId);
  const result = await MessageModel.updateMany(
    {
      tenantId,
      companyId: toObjectId(companyId),
      conversationId,
      recipientId: toObjectId(userId),
      status: { $ne: "read" },
    },
    { status: "read", readAt: new Date() }
  );
  return result.modifiedCount;
}

// ─── 6. Delete Message (Soft) ──────────────────────────────────────────────

export async function deleteMessage(
  tenantId: string,
  companyId: string,
  userId: string,
  messageId: string
): Promise<void> {
  const message = await MessageModel.findOne({
    _id: toObjectId(messageId),
    tenantId,
    companyId: toObjectId(companyId),
  });
  if (!message) {
    throw Object.assign(new Error("Message not found"), { status: 404 });
  }

  const userOid = toObjectId(userId);
  if (message.senderId.equals(userOid)) {
    message.deletedBySender = true;
  } else if (message.recipientId.equals(userOid)) {
    message.deletedByRecipient = true;
  } else {
    throw Object.assign(new Error("Not authorized"), { status: 403 });
  }

  await message.save();
}

// ─── 7. Get Unread Message Count ───────────────────────────────────────────

export async function getUnreadCount(
  tenantId: string,
  companyId: string,
  userId: string
): Promise<number> {
  return MessageModel.countDocuments({
    tenantId,
    companyId: toObjectId(companyId),
    recipientId: toObjectId(userId),
    status: { $ne: "read" },
    deletedByRecipient: false,
  });
}

// ─── 8. Search Messages ───────────────────────────────────────────────────

export async function searchMessages(
  tenantId: string,
  companyId: string,
  userId: string,
  query: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ messages: MessageDocument[]; total: number }> {
  const { page = 1, pageSize = 20 } = params;
  const companyOid = toObjectId(companyId);
  const userOid = toObjectId(userId);

  const filter = {
    tenantId,
    companyId: companyOid,
    $or: [
      { senderId: userOid, deletedBySender: false },
      { recipientId: userOid, deletedByRecipient: false },
    ],
    $text: { $search: query },
  };

  // Fallback to regex if text index isn't set up
  const regexFilter = {
    tenantId,
    companyId: companyOid,
    $or: [
      { senderId: userOid, deletedBySender: false },
      { recipientId: userOid, deletedByRecipient: false },
    ],
    $and: [
      {
        $or: [
          { subject: { $regex: query, $options: "i" } },
          { body: { $regex: query, $options: "i" } },
        ],
      },
    ],
  };

  let messages: MessageDocument[];
  let total: number;

  try {
    [messages, total] = await Promise.all([
      MessageModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean() as any as Promise<MessageDocument[]>,
      MessageModel.countDocuments(filter),
    ]);
  } catch {
    // text index may not exist, fall back to regex
    [messages, total] = await Promise.all([
      MessageModel.find(regexFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean() as any as Promise<MessageDocument[]>,
      MessageModel.countDocuments(regexFilter),
    ]);
  }

  return { messages, total };
}

// ─── 9. Get Sent Messages ──────────────────────────────────────────────────

export async function getSentMessages(
  tenantId: string,
  companyId: string,
  userId: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<{ messages: MessageDocument[]; total: number }> {
  const { page = 1, pageSize = 20 } = params;
  const filter = {
    tenantId,
    companyId: toObjectId(companyId),
    senderId: toObjectId(userId),
    deletedBySender: false,
  };

  const [messages, total] = await Promise.all([
    MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MessageModel.countDocuments(filter),
  ]);

  return { messages: messages as any as MessageDocument[], total };
}
