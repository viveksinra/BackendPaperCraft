import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type AnnouncementAudience = "class" | "organization";

// ─── Document interface ─────────────────────────────────────────────────────

export interface AnnouncementDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  classId: Types.ObjectId | null;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: Date;
  expiresAt: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ────────────────────────────────────────────────────────────

const AnnouncementSchema = new Schema<AnnouncementDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },
    audience: {
      type: String,
      enum: ["class", "organization"],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 10000 },
    isPinned: { type: Boolean, default: false },
    publishedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

AnnouncementSchema.index({ companyId: 1, audience: 1, publishedAt: -1 });
AnnouncementSchema.index({ companyId: 1, classId: 1, publishedAt: -1 });
AnnouncementSchema.index({ companyId: 1, isPinned: 1, publishedAt: -1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const AnnouncementModel =
  (models.Announcement as Model<AnnouncementDocument>) ||
  model<AnnouncementDocument>("Announcement", AnnouncementSchema);
