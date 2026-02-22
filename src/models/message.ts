import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type MessageStatus = "sent" | "delivered" | "read";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface MessageAttachment {
  name: string;
  url: string;
  fileSize: number;
  mimeType: string;
}

// ─── Document interface ────────────────────────────────────────────────────

export interface MessageDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  conversationId: string;
  senderId: Types.ObjectId;
  senderRole: "teacher" | "student" | "parent" | "admin";
  recipientId: Types.ObjectId;
  recipientRole: "teacher" | "student" | "parent" | "admin";
  subject: string;
  body: string;
  attachments: MessageAttachment[];
  parentMessageId: Types.ObjectId | null;
  status: MessageStatus;
  readAt: Date | null;
  deletedBySender: boolean;
  deletedByRecipient: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const AttachmentSchema = new Schema<MessageAttachment>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileSize: { type: Number, default: 0, min: 0 },
    mimeType: { type: String, default: "" },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const MessageSchema = new Schema<MessageDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    conversationId: { type: String, required: true, index: true },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["teacher", "student", "parent", "admin"],
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientRole: {
      type: String,
      enum: ["teacher", "student", "parent", "admin"],
      required: true,
    },
    subject: { type: String, default: "", maxlength: 500, trim: true },
    body: { type: String, required: true, maxlength: 10000 },
    attachments: { type: [AttachmentSchema], default: [] },
    parentMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    readAt: { type: Date, default: null },
    deletedBySender: { type: Boolean, default: false },
    deletedByRecipient: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

MessageSchema.index({ tenantId: 1, companyId: 1, senderId: 1, createdAt: -1 });
MessageSchema.index({ tenantId: 1, companyId: 1, recipientId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ tenantId: 1, companyId: 1, recipientId: 1, status: 1 });
MessageSchema.index({ parentMessageId: 1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const MessageModel =
  (models.Message as Model<MessageDocument>) ||
  model<MessageDocument>("Message", MessageSchema);
