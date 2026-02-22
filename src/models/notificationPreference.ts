import { Document, Model, Schema, Types, model, models } from "mongoose";
import type { NotificationCategory } from "./notification";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type DeliveryChannel = "in_app" | "email" | "push";
export type DigestFrequency = "instant" | "hourly" | "daily" | "weekly" | "none";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface CategoryPreference {
  category: NotificationCategory;
  enabled: boolean;
  channels: DeliveryChannel[];
}

// ─── Document interface ────────────────────────────────────────────────────

export interface NotificationPreferenceDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  globalEnabled: boolean;
  emailDigestFrequency: DigestFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  categories: CategoryPreference[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const CategoryPreferenceSchema = new Schema<CategoryPreference>(
  {
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
    enabled: { type: Boolean, default: true },
    channels: {
      type: [{ type: String, enum: ["in_app", "email", "push"] }],
      default: ["in_app", "email"],
    },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const NotificationPreferenceSchema = new Schema<NotificationPreferenceDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    globalEnabled: { type: Boolean, default: true },
    emailDigestFrequency: {
      type: String,
      enum: ["instant", "hourly", "daily", "weekly", "none"],
      default: "instant",
    },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: "22:00" },
    quietHoursEnd: { type: String, default: "07:00" },
    categories: {
      type: [CategoryPreferenceSchema],
      default: () => [
        { category: "messaging", enabled: true, channels: ["in_app", "email"] },
        { category: "homework", enabled: true, channels: ["in_app", "email"] },
        { category: "fees", enabled: true, channels: ["in_app", "email"] },
        { category: "announcements", enabled: true, channels: ["in_app"] },
        { category: "tests", enabled: true, channels: ["in_app", "email"] },
        { category: "discussions", enabled: true, channels: ["in_app"] },
        { category: "gamification", enabled: true, channels: ["in_app"] },
        { category: "courses", enabled: true, channels: ["in_app", "email"] },
        { category: "payments", enabled: true, channels: ["in_app", "email"] },
        { category: "system", enabled: true, channels: ["in_app", "email"] },
      ],
    },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

NotificationPreferenceSchema.index(
  { tenantId: 1, companyId: 1, userId: 1 },
  { unique: true }
);

// ─── Export ────────────────────────────────────────────────────────────────

export const NotificationPreferenceModel =
  (models.NotificationPreference as Model<NotificationPreferenceDocument>) ||
  model<NotificationPreferenceDocument>(
    "NotificationPreference",
    NotificationPreferenceSchema
  );
