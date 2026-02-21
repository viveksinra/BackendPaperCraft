import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type definitions ────────────────────────────────────────────────────────

export type LogoPosition = "left" | "center" | "right";
export type InstructionPosition = "before_sections" | "per_section";
export type NumberingStyle = "numeric" | "alpha" | "roman";
export type PaperSize = "A4" | "Letter";

export interface TemplateHeader {
  showLogo: boolean;
  logoPosition: LogoPosition;
  title: string;
  subtitle: string;
  studentInfoFields: string[];
}

export interface TemplateInstructions {
  show: boolean;
  text: string;
  position: InstructionPosition;
}

export interface TemplateSections {
  numberingStyle: NumberingStyle;
  showSectionHeaders: boolean;
  pageBreakBetweenSections: boolean;
}

export interface TemplateFooter {
  showPageNumbers: boolean;
  copyrightText: string;
  showWatermark: boolean;
  watermarkText: string;
}

export interface TemplateFormatting {
  paperSize: PaperSize;
  margins: { top: number; right: number; bottom: number; left: number };
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
}

export interface TemplateLayout {
  header: TemplateHeader;
  instructions: TemplateInstructions;
  sections: TemplateSections;
  footer: TemplateFooter;
  formatting: TemplateFormatting;
}

export interface PaperTemplateDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  description: string;
  layout: TemplateLayout;
  isPreBuilt: boolean;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const TemplateHeaderSchema = new Schema(
  {
    showLogo:          { type: Boolean, default: true },
    logoPosition:      { type: String, enum: ["left", "center", "right"], default: "left" },
    title:             { type: String, default: "" },
    subtitle:          { type: String, default: "" },
    studentInfoFields: { type: [String], default: ["Name", "Date"] },
  },
  { _id: false }
);

const TemplateInstructionsSchema = new Schema(
  {
    show:     { type: Boolean, default: true },
    text:     { type: String, default: "" },
    position: { type: String, enum: ["before_sections", "per_section"], default: "before_sections" },
  },
  { _id: false }
);

const TemplateSectionsSchema = new Schema(
  {
    numberingStyle:           { type: String, enum: ["numeric", "alpha", "roman"], default: "numeric" },
    showSectionHeaders:       { type: Boolean, default: true },
    pageBreakBetweenSections: { type: Boolean, default: false },
  },
  { _id: false }
);

const TemplateFooterSchema = new Schema(
  {
    showPageNumbers: { type: Boolean, default: true },
    copyrightText:   { type: String, default: "" },
    showWatermark:   { type: Boolean, default: false },
    watermarkText:   { type: String, default: "" },
  },
  { _id: false }
);

const TemplateFormattingSchema = new Schema(
  {
    paperSize:   { type: String, enum: ["A4", "Letter"], default: "A4" },
    margins: {
      top:    { type: Number, default: 20 },
      right:  { type: Number, default: 15 },
      bottom: { type: Number, default: 20 },
      left:   { type: Number, default: 15 },
    },
    fontSize:    { type: Number, default: 12 },
    fontFamily:  { type: String, default: "Arial" },
    lineSpacing: { type: Number, default: 1.5 },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────────────────────

const PaperTemplateSchema = new Schema<PaperTemplateDocument>(
  {
    tenantId:    { type: String, required: true, index: true },
    companyId:   { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    layout: {
      header:       { type: TemplateHeaderSchema, default: () => ({}) },
      instructions: { type: TemplateInstructionsSchema, default: () => ({}) },
      sections:     { type: TemplateSectionsSchema, default: () => ({}) },
      footer:       { type: TemplateFooterSchema, default: () => ({}) },
      formatting:   { type: TemplateFormattingSchema, default: () => ({}) },
    },
    isPreBuilt: { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true },
    createdBy:  { type: String, required: true, lowercase: true, trim: true },
    updatedBy:  { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

PaperTemplateSchema.index({ companyId: 1, isActive: 1 });
PaperTemplateSchema.index({ companyId: 1, isPreBuilt: 1 });

export const PaperTemplateModel =
  (models.PaperTemplate as Model<PaperTemplateDocument>) ||
  model<PaperTemplateDocument>("PaperTemplate", PaperTemplateSchema);
