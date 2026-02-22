import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type ReportType =
  | "progress_report"
  | "mock_analysis"
  | "class_summary"
  | "custom";

export type ReportStatus = "pending" | "generating" | "completed" | "failed";

// ─── Document interface ─────────────────────────────────────────────────────

export interface ReportDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  type: ReportType;
  title: string;
  studentUserId: Types.ObjectId | null;
  classId: Types.ObjectId | null;
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  templateId: string;
  pdfUrl: string;
  pdfSize: number;
  status: ReportStatus;
  failureReason: string;
  generatedBy: string;
  generatedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ────────────────────────────────────────────────────────────

const ReportSchema = new Schema<ReportDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["progress_report", "mock_analysis", "class_summary", "custom"],
      required: true,
    },
    title: { type: String, required: true },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },
    dateRange: {
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
    },
    templateId: {
      type: String,
      enum: ["standard", "eleven_plus", "custom"],
      default: "standard",
    },
    pdfUrl: { type: String, default: "" },
    pdfSize: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "generating", "completed", "failed"],
      default: "pending",
    },
    failureReason: { type: String, default: "" },
    generatedBy: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    generatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

ReportSchema.index({ companyId: 1, studentUserId: 1, type: 1 });
ReportSchema.index({ companyId: 1, status: 1 });
ReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const ReportModel =
  (models.Report as Model<ReportDocument>) ||
  model<ReportDocument>("Report", ReportSchema);
