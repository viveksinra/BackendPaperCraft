import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type NotificationType =
  | "message_received"
  | "homework_assigned"
  | "homework_due_soon"
  | "homework_overdue"
  | "homework_graded"
  | "fee_reminder"
  | "announcement_posted"
  | "test_scheduled"
  | "test_graded"
  | "discussion_reply"
  | "discussion_mention"
  | "badge_earned"
  | "level_up"
  | "streak_milestone"
  | "course_enrolled"
  | "course_completed"
  | "payment_received"
  | "system";

export type NotificationCategory =
  | "messaging"
  | "homework"
  | "fees"
  | "announcements"
  | "tests"
  | "discussions"
  | "gamification"
  | "courses"
  | "payments"
  | "system";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

// ─── Document interface ────────────────────────────────────────────────────

export interface NotificationDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  icon: string;
  actionUrl: string;
  referenceType: string;
  referenceId: string;
  isRead: boolean;
  readAt: Date | null;
  isArchived: boolean;
  emailSent: boolean;
  emailSentAt: Date | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ───────────────────────────────────────────────────────────

const NotificationSchema = new Schema<NotificationDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "message_received",
        "homework_assigned",
        "homework_due_soon",
        "homework_overdue",
        "homework_graded",
        "fee_reminder",
        "announcement_posted",
        "test_scheduled",
        "test_graded",
        "discussion_reply",
        "discussion_mention",
        "badge_earned",
        "level_up",
        "streak_milestone",
        "course_enrolled",
        "course_completed",
        "payment_received",
        "system",
      ],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "messaging",
        "homework",
        "fees",
        "announcements",
        "tests",
        "discussions",
        "gamification",
        "courses",
        "payments",
        "system",
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    title: { type: String, required: true, maxlength: 300, trim: true },
    body: { type: String, required: true, maxlength: 2000 },
    icon: { type: String, default: "" },
    actionUrl: { type: String, default: "" },
    referenceType: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

NotificationSchema.index({ tenantId: 1, companyId: 1, recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, companyId: 1, recipientId: 1, category: 1 });
NotificationSchema.index({ tenantId: 1, companyId: 1, recipientId: 1, isArchived: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
NotificationSchema.index({ createdAt: -1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const NotificationModel =
  (models.Notification as Model<NotificationDocument>) ||
  model<NotificationDocument>("Notification", NotificationSchema);
