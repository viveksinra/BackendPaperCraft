import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type definitions ────────────────────────────────────────────────────────

export interface TopicDistribution {
  topicId: Types.ObjectId;
  percentage: number;
}

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
  expert: number;
}

export interface BlueprintSection {
  name: string;
  questionCount: number;
  questionTypes: string[];
  marksPerQuestion: number;
  mixedMarks: boolean;
  timeLimit: number;
  topicDistribution: TopicDistribution[];
  difficultyMix: DifficultyMix;
  instructions: string;
  subjectId: Types.ObjectId | null;
}

export interface BlueprintConstraints {
  excludeRecentlyUsed: boolean;
  recentlyUsedWindow: number;
  excludeQuestionIds: Types.ObjectId[];
  requireApprovedOnly: boolean;
}

export interface PaperBlueprintDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  description: string;
  totalMarks: number;
  totalTime: number;
  sections: BlueprintSection[];
  constraints: BlueprintConstraints;
  isPreBuilt: boolean;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const TopicDistributionSchema = new Schema(
  {
    topicId:    { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const DifficultyMixSchema = new Schema(
  {
    easy:   { type: Number, default: 25, min: 0, max: 100 },
    medium: { type: Number, default: 50, min: 0, max: 100 },
    hard:   { type: Number, default: 20, min: 0, max: 100 },
    expert: { type: Number, default: 5,  min: 0, max: 100 },
  },
  { _id: false }
);

const BlueprintSectionSchema = new Schema(
  {
    name:              { type: String, required: true },
    questionCount:     { type: Number, required: true, min: 1 },
    questionTypes:     { type: [String], default: [] },
    marksPerQuestion:  { type: Number, default: 1 },
    mixedMarks:        { type: Boolean, default: false },
    timeLimit:         { type: Number, default: 0 },
    topicDistribution: { type: [TopicDistributionSchema], default: [] },
    difficultyMix:     { type: DifficultyMixSchema, default: () => ({}) },
    instructions:      { type: String, default: "" },
    subjectId:         { type: Schema.Types.ObjectId, ref: "Subject", default: null },
  },
  { _id: false }
);

const BlueprintConstraintsSchema = new Schema(
  {
    excludeRecentlyUsed: { type: Boolean, default: true },
    recentlyUsedWindow:  { type: Number, default: 30 },
    excludeQuestionIds:  { type: [Schema.Types.ObjectId], default: [] },
    requireApprovedOnly: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────────────────────

const PaperBlueprintSchema = new Schema<PaperBlueprintDocument>(
  {
    tenantId:    { type: String, required: true, index: true },
    companyId:   { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    totalMarks:  { type: Number, required: true, min: 1 },
    totalTime:   { type: Number, required: true, min: 1 },
    sections:    { type: [BlueprintSectionSchema], default: [] },
    constraints: { type: BlueprintConstraintsSchema, default: () => ({}) },
    isPreBuilt:  { type: Boolean, default: false },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: String, required: true, lowercase: true, trim: true },
    updatedBy:   { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

PaperBlueprintSchema.index({ companyId: 1, isActive: 1 });
PaperBlueprintSchema.index({ companyId: 1, isPreBuilt: 1 });

export const PaperBlueprintModel =
  (models.PaperBlueprint as Model<PaperBlueprintDocument>) ||
  model<PaperBlueprintDocument>("PaperBlueprint", PaperBlueprintSchema);
