import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants ────────────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  "mcq_single",
  "mcq_multiple",
  "true_false",
  "fill_in_blank",
  "short_answer",
  "long_answer",
  "comprehension",
  "match_the_column",
  "assertion_reasoning",
  "numerical",
  "math_latex",
  "diagram_image",
  "verbal_reasoning",
  "non_verbal_reasoning",
  "english_comprehension",
  "creative_writing",
  "cloze_passage",
  "synonym_antonym",
  "missing_letters",
  "word_definition",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTY_LEVELS = ["easy", "medium", "hard", "very_hard"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const REVIEW_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ─── Sub-document Interfaces ──────────────────────────────────────────────────

export interface QuestionOption {
  label: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
  imageUrl?: string;
}

export interface QuestionImage {
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface SubQuestion {
  questionNumber: number;
  type: QuestionType;
  body: string;
  options?: QuestionOption[];
  correctAnswer?: string;
  marks: number;
  explanation?: string;
}

export interface QuestionContent {
  body: string;
  bodyHtml?: string;
  options?: QuestionOption[];
  correctAnswer?: string;
  correctAnswers?: string[];
  explanation?: string;
  solution?: string;
  solutionHtml?: string;
  passage?: string;
  passageHtml?: string;
  matchPairs?: MatchPair[];
  assertion?: string;
  reason?: string;
  subQuestions?: SubQuestion[];
  images?: QuestionImage[];
  hints?: string[];
  numericalAnswer?: number;
  numericalTolerance?: number;
  numericalUnit?: string;
  wordList?: string[];
  blanks?: string[];
}

export interface QuestionMetadata {
  subjectId?: Types.ObjectId;
  chapterId?: Types.ObjectId;
  topicId?: Types.ObjectId;
  subtopicId?: Types.ObjectId;
  difficulty: DifficultyLevel;
  marks: number;
  negativeMarks: number;
  expectedTime: number;
  examTypes: string[];
  tags: string[];
  language: string;
  source?: string;
  year?: number;
}

export interface UsageHistoryEntry {
  entityType: "paper" | "test" | "homework" | "course";
  entityId: Types.ObjectId;
  usedAt: Date;
}

export interface QuestionUsage {
  paperCount: number;
  testCount: number;
  homeworkCount: number;
  lastUsedAt?: Date;
  history: UsageHistoryEntry[];
}

export interface QuestionReview {
  status: ReviewStatus;
  submittedAt?: Date;
  submittedBy?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  notes?: string;
  rejectionReason?: string;
}

export interface QuestionPerformance {
  totalAttempts: number;
  correctAttempts: number;
  avgScore: number;
  avgTimeSpent: number;
  discriminationIndex: number;
  difficultyIndex: number;
}

// ─── Document Interface ───────────────────────────────────────────────────────

export interface QuestionDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  type: QuestionType;
  content: QuestionContent;
  metadata: QuestionMetadata;
  usage: QuestionUsage;
  review: QuestionReview;
  performance: QuestionPerformance;
  isArchived: boolean;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const QuestionOptionSchema = new Schema(
  {
    label: { type: String, default: "" },
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
    explanation: { type: String },
    imageUrl: { type: String },
  },
  { _id: false }
);

const QuestionImageSchema = new Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const MatchPairSchema = new Schema(
  {
    left: { type: String, required: true },
    right: { type: String, required: true },
  },
  { _id: false }
);

const SubQuestionSchema = new Schema(
  {
    questionNumber: { type: Number, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    body: { type: String, required: true },
    options: [QuestionOptionSchema],
    correctAnswer: { type: String },
    marks: { type: Number, required: true, min: 0 },
    explanation: { type: String },
  },
  { _id: false }
);

const UsageHistoryEntrySchema = new Schema(
  {
    entityType: { type: String, enum: ["paper", "test", "homework", "course"], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    usedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const QuestionSchema = new Schema<QuestionDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    type: { type: String, required: true, enum: QUESTION_TYPES },

    content: {
      body: { type: String, required: true },
      bodyHtml: { type: String },
      options: [QuestionOptionSchema],
      correctAnswer: { type: String },
      correctAnswers: [{ type: String }],
      explanation: { type: String },
      solution: { type: String },
      solutionHtml: { type: String },
      passage: { type: String },
      passageHtml: { type: String },
      matchPairs: [MatchPairSchema],
      assertion: { type: String },
      reason: { type: String },
      subQuestions: [SubQuestionSchema],
      images: [QuestionImageSchema],
      hints: [{ type: String }],
      numericalAnswer: { type: Number },
      numericalTolerance: { type: Number },
      numericalUnit: { type: String },
      wordList: [{ type: String }],
      blanks: [{ type: String }],
    },

    metadata: {
      subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
      chapterId: { type: Schema.Types.ObjectId, ref: "Subject" },
      topicId: { type: Schema.Types.ObjectId, ref: "Subject" },
      subtopicId: { type: Schema.Types.ObjectId, ref: "Subject" },
      difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: "medium" },
      marks: { type: Number, default: 1, min: 0 },
      negativeMarks: { type: Number, default: 0, min: 0 },
      expectedTime: { type: Number, default: 60, min: 0 },
      examTypes: [{ type: String, trim: true }],
      tags: [{ type: String, trim: true, lowercase: true }],
      language: { type: String, default: "en" },
      source: { type: String },
      year: { type: Number },
    },

    usage: {
      paperCount: { type: Number, default: 0 },
      testCount: { type: Number, default: 0 },
      homeworkCount: { type: Number, default: 0 },
      lastUsedAt: { type: Date },
      history: [UsageHistoryEntrySchema],
    },

    review: {
      status: { type: String, enum: REVIEW_STATUSES, default: "draft" },
      submittedAt: { type: Date },
      submittedBy: { type: String, lowercase: true, trim: true },
      reviewedAt: { type: Date },
      reviewedBy: { type: String, lowercase: true, trim: true },
      notes: { type: String },
      rejectionReason: { type: String },
    },

    performance: {
      totalAttempts: { type: Number, default: 0 },
      correctAttempts: { type: Number, default: 0 },
      avgScore: { type: Number, default: 0 },
      avgTimeSpent: { type: Number, default: 0 },
      discriminationIndex: { type: Number, default: 0 },
      difficultyIndex: { type: Number, default: 0 },
    },

    isArchived: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    createdBy: { type: String, lowercase: true, trim: true },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

QuestionSchema.index({ tenantId: 1, companyId: 1 });
QuestionSchema.index({ companyId: 1, type: 1, "metadata.difficulty": 1 });
QuestionSchema.index({ companyId: 1, "review.status": 1, isArchived: 1 });
QuestionSchema.index({ companyId: 1, "metadata.subjectId": 1 });
QuestionSchema.index({ companyId: 1, "metadata.tags": 1 });
QuestionSchema.index({ "content.body": "text", "content.solution": "text", "content.passage": "text" });

export const QuestionModel =
  (models.Question as Model<QuestionDocument>) ||
  model<QuestionDocument>("Question", QuestionSchema);
