import { Types } from "mongoose";
import {
  NotificationModel,
  NotificationDocument,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
} from "../models/notification";
import * as prefService from "./notificationPreferenceService";
import { emitToUser } from "../shared/socket/socketServer";
import { logger } from "../shared/logger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// Map notification type to category
const TYPE_CATEGORY_MAP: Record<NotificationType, NotificationCategory> = {
  message_received: "messaging",
  homework_assigned: "homework",
  homework_due_soon: "homework",
  homework_overdue: "homework",
  homework_graded: "homework",
  fee_reminder: "fees",
  announcement_posted: "announcements",
  test_scheduled: "tests",
  test_graded: "tests",
  discussion_reply: "discussions",
  discussion_mention: "discussions",
  badge_earned: "gamification",
  level_up: "gamification",
  streak_milestone: "gamification",
  course_enrolled: "courses",
  course_completed: "courses",
  payment_received: "payments",
  system: "system",
};

// ─── 1. Create Notification ────────────────────────────────────────────────

export interface CreateNotificationInput {
  tenantId: string;
  companyId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  priority?: NotificationPriority;
  icon?: string;
  actionUrl?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationDocument | null> {
  const category = TYPE_CATEGORY_MAP[input.type] || "system";

  // Check user preferences
  const { enabled, channels } = await prefService.getCategoryChannels(
    input.tenantId,
    input.companyId,
    input.recipientId,
    category
  );

  if (!enabled) {
    logger.debug({
      msg: "Notification suppressed by user preference",
      type: input.type,
      recipientId: input.recipientId,
    });
    return null;
  }

  const notification = await NotificationModel.create({
    tenantId: input.tenantId,
    companyId: toObjectId(input.companyId),
    recipientId: toObjectId(input.recipientId),
    type: input.type,
    category,
    priority: input.priority || "normal",
    title: input.title,
    body: input.body,
    icon: input.icon || "",
    actionUrl: input.actionUrl || "",
    referenceType: input.referenceType || "",
    referenceId: input.referenceId || "",
    metadata: input.metadata || {},
    expiresAt: input.expiresAt || null,
  });

  // Emit real-time notification if in_app channel is enabled
  if (channels.includes("in_app")) {
    emitToUser(input.recipientId, "notification:new", {
      id: String(notification._id),
      type: notification.type,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
    });
  }

  logger.info({
    msg: "Notification created",
    notificationId: String(notification._id),
    type: input.type,
    recipientId: input.recipientId,
    channels,
  });

  return notification;
}

// ─── 2. Create Bulk Notifications ──────────────────────────────────────────

export async function createBulkNotifications(
  inputs: CreateNotificationInput[]
): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    const result = await createNotification(input);
    if (result) created++;
  }
  return created;
}

// ─── 3. Get Notifications for User ─────────────────────────────────────────

interface ListParams {
  category?: NotificationCategory;
  isRead?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getNotifications(
  tenantId: string,
  companyId: string,
  userId: string,
  params: ListParams = {}
): Promise<{
  notifications: NotificationDocument[];
  total: number;
  unreadCount: number;
}> {
  const { category, isRead, page = 1, pageSize = 20 } = params;
  const companyOid = toObjectId(companyId);
  const userOid = toObjectId(userId);

  const filter: Record<string, unknown> = {
    tenantId,
    companyId: companyOid,
    recipientId: userOid,
    isArchived: false,
  };

  if (category) filter.category = category;
  if (isRead !== undefined) filter.isRead = isRead;

  const [notifications, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({
      tenantId,
      companyId: companyOid,
      recipientId: userOid,
      isRead: false,
      isArchived: false,
    }),
  ]);

  return { notifications: notifications as any as NotificationDocument[], total, unreadCount };
}

// ─── 4. Mark as Read ───────────────────────────────────────────────────────

export async function markAsRead(
  tenantId: string,
  companyId: string,
  userId: string,
  notificationId: string
): Promise<NotificationDocument> {
  const notification = await NotificationModel.findOneAndUpdate(
    {
      _id: toObjectId(notificationId),
      tenantId,
      companyId: toObjectId(companyId),
      recipientId: toObjectId(userId),
    },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw Object.assign(new Error("Notification not found"), { status: 404 });
  }
  return notification;
}

// ─── 5. Mark All as Read ───────────────────────────────────────────────────

export async function markAllAsRead(
  tenantId: string,
  companyId: string,
  userId: string,
  category?: NotificationCategory
): Promise<number> {
  const filter: Record<string, unknown> = {
    tenantId,
    companyId: toObjectId(companyId),
    recipientId: toObjectId(userId),
    isRead: false,
  };
  if (category) filter.category = category;

  const result = await NotificationModel.updateMany(filter, {
    isRead: true,
    readAt: new Date(),
  });
  return result.modifiedCount;
}

// ─── 6. Archive Notification ───────────────────────────────────────────────

export async function archiveNotification(
  tenantId: string,
  companyId: string,
  userId: string,
  notificationId: string
): Promise<void> {
  const result = await NotificationModel.findOneAndUpdate(
    {
      _id: toObjectId(notificationId),
      tenantId,
      companyId: toObjectId(companyId),
      recipientId: toObjectId(userId),
    },
    { isArchived: true }
  );
  if (!result) {
    throw Object.assign(new Error("Notification not found"), { status: 404 });
  }
}

// ─── 7. Get Unread Count ───────────────────────────────────────────────────

export async function getUnreadCount(
  tenantId: string,
  companyId: string,
  userId: string
): Promise<number> {
  return NotificationModel.countDocuments({
    tenantId,
    companyId: toObjectId(companyId),
    recipientId: toObjectId(userId),
    isRead: false,
    isArchived: false,
  });
}

// ─── 8. Delete Old Notifications ───────────────────────────────────────────

export async function deleteOldNotifications(
  tenantId: string,
  companyId: string,
  olderThanDays: number = 90
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await NotificationModel.deleteMany({
    tenantId,
    companyId: toObjectId(companyId),
    createdAt: { $lt: cutoff },
    isArchived: true,
  });
  return result.deletedCount;
}
