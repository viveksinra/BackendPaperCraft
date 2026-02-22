import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type ThreadStatus = "open" | "closed" | "pinned" | "archived";
export type ThreadCategory = "general" | "homework" | "test" | "course" | "announcement" | "question" | "feedback";

// ─── Document interface ────────────────────────────────────────────────────

export interface DiscussionThreadDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  classId: Types.ObjectId | null;
  courseId: Types.ObjectId | null;
  title: string;
  body: string;
  category: ThreadCategory;
  tags: string[];
  authorId: Types.ObjectId;
  authorRole: "teacher" | "student" | "parent" | "admin";
  authorName: string;
  status: ThreadStatus;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  lastReplyAt: Date | null;
  lastReplyBy: Types.ObjectId | null;
  viewCount: number;
  upvoteCount: number;
  upvotedBy: Types.ObjectId[];
  flagCount: number;
  flaggedBy: Types.ObjectId[];
  moderationNote: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ───────────────────────────────────────────────────────────

const DiscussionThreadSchema = new Schema<DiscussionThreadDocument>(
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
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    body: { type: String, required: true, maxlength: 20000 },
    category: {
      type: String,
      enum: ["general", "homework", "test", "course", "announcement", "question", "feedback"],
      default: "general",
    },
    tags: { type: [String], default: [] },
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
    status: {
      type: String,
      enum: ["open", "closed", "pinned", "archived"],
      default: "open",
    },
    isPinned: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    replyCount: { type: Number, default: 0, min: 0 },
    lastReplyAt: { type: Date, default: null },
    lastReplyBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    viewCount: { type: Number, default: 0, min: 0 },
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
    moderationNote: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, status: 1, createdAt: -1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, classId: 1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, courseId: 1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, authorId: 1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, category: 1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, isPinned: -1, lastReplyAt: -1 });
DiscussionThreadSchema.index({ tenantId: 1, companyId: 1, flagCount: -1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const DiscussionThreadModel =
  (models.DiscussionThread as Model<DiscussionThreadDocument>) ||
  model<DiscussionThreadDocument>("DiscussionThread", DiscussionThreadSchema);
