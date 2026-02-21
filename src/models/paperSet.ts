import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type definitions ────────────────────────────────────────────────────────

export type PaperSetStatus = "draft" | "published" | "archived";
export type Currency = "GBP" | "INR";

export interface PaperSetPdf {
  type: string;
  fileName: string;
  s3Key: string;
  fileSize: number;
}

export interface PaperSetEntry {
  paperId: Types.ObjectId;
  order: number;
  pdfs: PaperSetPdf[];
}

export interface PaperSetPricing {
  currency: Currency;
  pricePerPaper: number;
  bundlePrice: number;
  checkingServicePrice: number;
  oneToOneServicePrice: number;
  isFree: boolean;
}

export interface PaperSetDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  shortDescription: string;
  fullDescription: string;
  examType: string;
  yearGroup: string;
  subjectCategory: string;
  papers: PaperSetEntry[];
  pricing: PaperSetPricing;
  imageUrls: string[];
  status: PaperSetStatus;
  sortDate: Date;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const PaperSetPdfSchema = new Schema(
  {
    type:     { type: String, required: true },
    fileName: { type: String, required: true },
    s3Key:    { type: String, required: true },
    fileSize: { type: Number, default: 0 },
  },
  { _id: false }
);

const PaperSetEntrySchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true },
    order:   { type: Number, default: 0 },
    pdfs:    { type: [PaperSetPdfSchema], default: [] },
  },
  { _id: false }
);

const PaperSetPricingSchema = new Schema(
  {
    currency:             { type: String, enum: ["GBP", "INR"], default: "GBP" },
    pricePerPaper:        { type: Number, default: 0 },
    bundlePrice:          { type: Number, default: 0 },
    checkingServicePrice: { type: Number, default: 0 },
    oneToOneServicePrice: { type: Number, default: 0 },
    isFree:               { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────────────────────

const PaperSetSchema = new Schema<PaperSetDocument>(
  {
    tenantId:         { type: String, required: true, index: true },
    companyId:        { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    title:            { type: String, required: true, trim: true },
    shortDescription: { type: String, default: "" },
    fullDescription:  { type: String, default: "" },
    examType:         { type: String, default: "Custom" },
    yearGroup:        { type: String, default: "" },
    subjectCategory:  { type: String, default: "" },
    papers:           { type: [PaperSetEntrySchema], default: [] },
    pricing:          { type: PaperSetPricingSchema, default: () => ({}) },
    imageUrls:        { type: [String], default: [] },
    status:           { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    sortDate:         { type: Date, default: Date.now },
    createdBy:        { type: String, required: true, lowercase: true, trim: true },
    updatedBy:        { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

PaperSetSchema.index({ companyId: 1, status: 1, sortDate: -1 });
PaperSetSchema.index({ companyId: 1, examType: 1 });

export const PaperSetModel =
  (models.PaperSet as Model<PaperSetDocument>) ||
  model<PaperSetDocument>("PaperSet", PaperSetSchema);
