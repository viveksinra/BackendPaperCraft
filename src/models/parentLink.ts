import { Document, Model, Schema, Types, model, models } from "mongoose";

// ── Interfaces ──────────────────────────────────────────────────────────────

export type LinkStatus = "pending" | "active" | "revoked";

export interface ParentLinkDocument extends Document {
  parentUserId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: LinkStatus;
  relationship: string;
  linkedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const ParentLinkSchema = new Schema<ParentLinkDocument>(
  {
    parentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    status: {
      type: String,
      enum: ["pending", "active", "revoked"],
      default: "active",
    },
    relationship: {
      type: String,
      enum: ["mother", "father", "guardian", "other"],
      default: "guardian",
    },
    linkedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────────────────────────

ParentLinkSchema.index({ parentUserId: 1, status: 1 });
ParentLinkSchema.index({ studentUserId: 1, status: 1 });
ParentLinkSchema.index({ parentUserId: 1, studentUserId: 1 }, { unique: true });

// ── Export ───────────────────────────────────────────────────────────────────

export const ParentLinkModel =
  (models.ParentLink as Model<ParentLinkDocument>) ||
  model<ParentLinkDocument>("ParentLink", ParentLinkSchema);
