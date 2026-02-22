import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Sub-document interfaces ────────────────────────────────────────────────

export interface DistractorStats {
  label: string;
  value: string;
  selectedCount: number;
  selectedPercentage: number;
  isCorrect: boolean;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface QuestionAnalyticsDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  questionId: Types.ObjectId;
  totalAttempts: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  accuracy: number;
  averageTimeSeconds: number;
  medianTimeSeconds: number;
  taggedDifficulty: string;
  actualDifficulty: string;
  discriminationIndex: number;
  distractorAnalysis: DistractorStats[];
  usageCount: number;
  lastUsedAt: Date | null;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ───────────────────────────────────────────────────

const DistractorStatsSchema = new Schema<DistractorStats>(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    selectedCount: { type: Number, default: 0 },
    selectedPercentage: { type: Number, default: 0 },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const QuestionAnalyticsSchema = new Schema<QuestionAnalyticsDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    totalAttempts: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    averageTimeSeconds: { type: Number, default: 0 },
    medianTimeSeconds: { type: Number, default: 0 },
    taggedDifficulty: { type: String, default: "" },
    actualDifficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "expert", ""],
      default: "",
    },
    discriminationIndex: { type: Number, default: 0, min: -1, max: 1 },
    distractorAnalysis: { type: [DistractorStatsSchema], default: [] },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

QuestionAnalyticsSchema.index(
  { companyId: 1, questionId: 1 },
  { unique: true }
);
QuestionAnalyticsSchema.index({
  companyId: 1,
  actualDifficulty: 1,
  discriminationIndex: -1,
});
QuestionAnalyticsSchema.index({ companyId: 1, accuracy: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const QuestionAnalyticsModel =
  (models.QuestionAnalytics as Model<QuestionAnalyticsDocument>) ||
  model<QuestionAnalyticsDocument>(
    "QuestionAnalytics",
    QuestionAnalyticsSchema
  );
