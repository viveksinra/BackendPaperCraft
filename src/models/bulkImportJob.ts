import { Document, Model, Schema, Types, model, models } from "mongoose";

export const IMPORT_STATUSES = [
  "uploaded",
  "parsing",
  "parsed",
  "importing",
  "completed",
  "failed",
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export interface ParsedQuestion {
  rowIndex: number;
  type: string;
  body: string;
  options?: { text: string; isCorrect: boolean }[];
  correctAnswer?: string;
  explanation?: string;
  difficulty?: string;
  marks?: number;
  tags?: string[];
  error?: string;
  isValid: boolean;
}

export interface BulkImportJobDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  source: "csv" | "docx" | "paste";
  fileName: string;
  fileKey?: string;
  status: ImportStatus;
  totalRows: number;
  parsedCount: number;
  importedCount: number;
  errorCount: number;
  parsedPreview: ParsedQuestion[];
  subjectMapping: {
    subjectId?: Types.ObjectId;
    chapterId?: Types.ObjectId;
    topicId?: Types.ObjectId;
  };
  defaultMetadata: {
    difficulty?: string;
    marks?: number;
    examTypes?: string[];
    tags?: string[];
  };
  errors: { row: number; message: string }[];
  createdBy: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ParsedQuestionSchema = new Schema(
  {
    rowIndex: { type: Number, required: true },
    type: { type: String, default: "mcq_single" },
    body: { type: String, default: "" },
    options: [
      {
        text: { type: String },
        isCorrect: { type: Boolean, default: false },
        _id: false,
      },
    ],
    correctAnswer: { type: String },
    explanation: { type: String },
    difficulty: { type: String },
    marks: { type: Number },
    tags: [{ type: String }],
    error: { type: String },
    isValid: { type: Boolean, default: true },
  },
  { _id: false }
);

const BulkImportJobSchema = new Schema<BulkImportJobDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    source: { type: String, enum: ["csv", "docx", "paste"], required: true },
    fileName: { type: String, required: true },
    fileKey: { type: String },
    status: { type: String, enum: IMPORT_STATUSES, default: "uploaded" },
    totalRows: { type: Number, default: 0 },
    parsedCount: { type: Number, default: 0 },
    importedCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    parsedPreview: [ParsedQuestionSchema],
    subjectMapping: {
      subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
      chapterId: { type: Schema.Types.ObjectId, ref: "Subject" },
      topicId: { type: Schema.Types.ObjectId, ref: "Subject" },
    },
    defaultMetadata: {
      difficulty: { type: String },
      marks: { type: Number },
      examTypes: [{ type: String }],
      tags: [{ type: String }],
    },
    errors: [
      {
        row: { type: Number },
        message: { type: String },
        _id: false,
      },
    ],
    createdBy: { type: String, lowercase: true, trim: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

BulkImportJobSchema.index({ tenantId: 1, companyId: 1 });
BulkImportJobSchema.index({ companyId: 1, status: 1 });

export const BulkImportJobModel =
  (models.BulkImportJob as Model<BulkImportJobDocument>) ||
  model<BulkImportJobDocument>("BulkImportJob", BulkImportJobSchema);
