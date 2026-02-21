import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type definitions ────────────────────────────────────────────────────────

export type PaperStatus = "draft" | "finalized" | "published";
export type PdfType = "question_paper" | "answer_sheet" | "solution_paper" | "passage" | "marking_guide" | "other";

export interface PaperQuestion {
  questionId: Types.ObjectId;
  questionNumber: number;
  marks: number;
  isRequired: boolean;
}

export interface PaperSection {
  name: string;
  instructions: string;
  timeLimit: number;
  questions: PaperQuestion[];
}

export interface PaperPdf {
  type: PdfType;
  fileName: string;
  s3Key: string;
  fileSize: number;
  generatedAt: Date;
}

export interface PaperDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  description: string;
  templateId: Types.ObjectId;
  blueprintId: Types.ObjectId | null;
  sections: PaperSection[];
  totalMarks: number;
  totalTime: number;
  status: PaperStatus;
  pdfs: PaperPdf[];
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const PaperQuestionSchema = new Schema(
  {
    questionId:     { type: Schema.Types.ObjectId, ref: "Question", required: true },
    questionNumber: { type: Number, required: true },
    marks:          { type: Number, required: true, min: 0 },
    isRequired:     { type: Boolean, default: true },
  },
  { _id: false }
);

const PaperSectionSchema = new Schema(
  {
    name:         { type: String, required: true },
    instructions: { type: String, default: "" },
    timeLimit:    { type: Number, default: 0 },
    questions:    { type: [PaperQuestionSchema], default: [] },
  },
  { _id: false }
);

const PaperPdfSchema = new Schema(
  {
    type:        { type: String, enum: ["question_paper", "answer_sheet", "solution_paper", "passage", "marking_guide", "other"], required: true },
    fileName:    { type: String, required: true },
    s3Key:       { type: String, required: true },
    fileSize:    { type: Number, default: 0 },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────────────────────

const PaperSchema = new Schema<PaperDocument>(
  {
    tenantId:    { type: String, required: true, index: true },
    companyId:   { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    templateId:  { type: Schema.Types.ObjectId, ref: "PaperTemplate", required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: "PaperBlueprint", default: null },
    sections:    { type: [PaperSectionSchema], default: [] },
    totalMarks:  { type: Number, default: 0 },
    totalTime:   { type: Number, default: 0 },
    status:      { type: String, enum: ["draft", "finalized", "published"], default: "draft", index: true },
    pdfs:        { type: [PaperPdfSchema], default: [] },
    version:     { type: Number, default: 1 },
    createdBy:   { type: String, required: true, lowercase: true, trim: true },
    updatedBy:   { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

PaperSchema.index({ companyId: 1, status: 1, createdAt: -1 });
PaperSchema.index({ companyId: 1, templateId: 1 });
PaperSchema.index({ companyId: 1, blueprintId: 1 });
PaperSchema.index({ "sections.questions.questionId": 1 });

export const PaperModel =
  (models.Paper as Model<PaperDocument>) ||
  model<PaperDocument>("Paper", PaperSchema);
