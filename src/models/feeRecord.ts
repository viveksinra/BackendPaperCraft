import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type FeeStatus = "unpaid" | "partial" | "paid";

// ─── Document interface ─────────────────────────────────────────────────────

export interface FeeRecordDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  classId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  amount: number;
  currency: "GBP" | "INR";
  amountPaid: number;
  status: FeeStatus;
  dueDate: Date | null;
  notes: string;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  paidAt: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ────────────────────────────────────────────────────────────

const FeeRecordSchema = new Schema<FeeRecordDocument>(
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
      required: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, default: 0, min: 0 },
    currency: {
      type: String,
      enum: ["GBP", "INR"],
      default: "GBP",
    },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 1000 },
    lastReminderSentAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, default: null },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

FeeRecordSchema.index({ companyId: 1, classId: 1, status: 1 });
FeeRecordSchema.index({ companyId: 1, studentUserId: 1 });
FeeRecordSchema.index(
  { classId: 1, studentUserId: 1 },
  { unique: true }
);

// ─── Export ─────────────────────────────────────────────────────────────────

export const FeeRecordModel =
  (models.FeeRecord as Model<FeeRecordDocument>) ||
  model<FeeRecordDocument>("FeeRecord", FeeRecordSchema);
