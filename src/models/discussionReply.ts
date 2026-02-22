import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Document interface ────────────────────────────────────────────────────

export interface DiscussionReplyDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  threadId: Types.ObjectId;
  parentReplyId: Types.ObjectId | null;
  authorId: Types.ObjectId;
  authorRole: "teacher" | "student" | "parent" | "admin";
  authorName: string;
  body: string;
  isEdited: boolean;
  editedAt: Date | null;
  isAcceptedAnswer: boolean;
  upvoteCount: number;
  upvotedBy: Types.ObjectId[];
  flagCount: number;
  flaggedBy: Types.ObjectId[];
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ───────────────────────────────────────────────────────────

const DiscussionReplySchema = new Schema<DiscussionReplyDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "DiscussionThread",
      required: true,
    },
    parentReplyId: {
      type: Schema.Types.ObjectId,
      ref: "DiscussionReply",
      default: null,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorRole: {
      type: String,
      enum: ["teacher", "student", "parent", "admin"],
      required: true,
    },
    authorName: { type: String, required: true, trim: true },
    body: { type: String, required: true, maxlength: 10000 },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isAcceptedAnswer: { type: Boolean, default: false },
    upvoteCount: { type: Number, default: 0, min: 0 },
    upvotedBy: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    flagCount: { type: Number, default: 0, min: 0 },
    flaggedBy: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

DiscussionReplySchema.index({ threadId: 1, createdAt: 1 });
DiscussionReplySchema.index({ threadId: 1, parentReplyId: 1 });
DiscussionReplySchema.index({ tenantId: 1, companyId: 1, authorId: 1 });
DiscussionReplySchema.index({ threadId: 1, isAcceptedAnswer: 1 });
DiscussionReplySchema.index({ tenantId: 1, companyId: 1, flagCount: -1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const DiscussionReplyModel =
  (models.DiscussionReply as Model<DiscussionReplyDocument>) ||
  model<DiscussionReplyDocument>("DiscussionReply", DiscussionReplySchema);
