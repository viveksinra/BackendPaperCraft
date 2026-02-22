import { getIO } from "./socketServer";
import { logger } from "../logger";

// ─── Emit notification events to specific users ──────────────────────────

export function emitNotification(
  userId: string,
  notification: {
    id: string;
    type: string;
    category: string;
    title: string;
    body: string;
    icon?: string;
    actionUrl?: string;
    createdAt: Date;
  }
): void {
  const io = getIO();
  if (!io) return;

  io.to(`user:${userId}`).emit("notification:new", notification);
}

export function emitNotificationCount(userId: string, unreadCount: number): void {
  const io = getIO();
  if (!io) return;

  io.to(`user:${userId}`).emit("notification:count", { unreadCount });
}

export function emitMessageReceived(
  userId: string,
  data: {
    messageId: string;
    senderId: string;
    senderName?: string;
    subject?: string;
    preview: string;
    conversationId: string;
    createdAt: Date;
  }
): void {
  const io = getIO();
  if (!io) return;

  io.to(`user:${userId}`).emit("message:new", data);
}

export function emitGamificationEvent(
  userId: string,
  event: "gamification:points" | "gamification:level-up" | "gamification:badge-earned",
  data: Record<string, unknown>
): void {
  const io = getIO();
  if (!io) return;

  io.to(`user:${userId}`).emit(event, data);
}

export function emitDiscussionReply(
  userId: string,
  data: {
    threadId: string;
    replyId: string;
    authorName: string;
    threadTitle: string;
  }
): void {
  const io = getIO();
  if (!io) return;

  io.to(`user:${userId}`).emit("discussion:reply", data);
}

logger.debug({ msg: "Notification socket module loaded" });
