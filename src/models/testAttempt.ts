import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "auto_submitted"
  | "graded";

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface AttemptAnswer {
  questionId: Types.ObjectId;
  sectionIndex: number;
  answer: unknown;
  isCorrect: boolean | null;
  marksAwarded: number | null;
  maxMarks: number;
  timeSpent: number; // seconds
  flagged: boolean;
  answeredAt: Date | null;
  feedback: string;
}

export interface AttemptSectionProgress {
  sectionIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  timeSpent: number; // seconds
  isLocked: boolean;
}

export interface SectionScore {
  sectionIndex: number;
  sectionName: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
}

export interface SubjectScore {
  subjectId: string;
  subjectName: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
}

export interface AttemptResult {
  totalMarks: number;
  marksObtained: number;
  percentage: number;
  grade: string;
  rank: number | null;
  percentile: number | null;
  sectionScores: SectionScore[];
  subjectScores: SubjectScore[];
  objectiveMarks: number;
  subjectiveMarks: number;
  isPassing: boolean;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface TestAttemptDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  testId: Types.ObjectId;
  studentId: Types.ObjectId;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: Date | null;
  submittedAt: Date | null;
  sections: AttemptSectionProgress[];
  answers: AttemptAnswer[];
  result: AttemptResult | null;
  questionOrder: Types.ObjectId[];
  optionOrders: Record<string, unknown>;
  currentSectionIndex: number;
  autoSavedAt: Date | null;
  ipAddress: string;
  userAgent: string;
  gradedBy: string | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const AttemptAnswerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    sectionIndex: { type: Number, required: true, min: 0 },
    answer: { type: Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, default: null },
    marksAwarded: { type: Number, default: null },
    maxMarks: { type: Number, required: true, min: 0 },
    timeSpent: { type: Number, default: 0, min: 0 },
    flagged: { type: Boolean, default: false },
    answeredAt: { type: Date, default: null },
    feedback: { type: String, default: "" },
  },
  { _id: false }
);

const AttemptSectionProgressSchema = new Schema(
  {
    sectionIndex: { type: Number, required: true, min: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    timeSpent: { type: Number, default: 0, min: 0 },
    isLocked: { type: Boolean, default: false },
  },
  { _id: false }
);

const SectionScoreSchema = new Schema(
  {
    sectionIndex: { type: Number, required: true },
    sectionName: { type: String, required: true },
    marksObtained: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const SubjectScoreSchema = new Schema(
  {
    subjectId: { type: String, required: true },
    subjectName: { type: String, required: true },
    marksObtained: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const AttemptResultSchema = new Schema(
  {
    totalMarks: { type: Number, required: true, min: 0 },
    marksObtained: { type: Number, required: true },
    percentage: { type: Number, required: true },
    grade: { type: String, required: true },
    rank: { type: Number, default: null },
    percentile: { type: Number, default: null },
    sectionScores: { type: [SectionScoreSchema], default: [] },
    subjectScores: { type: [SubjectScoreSchema], default: [] },
    objectiveMarks: { type: Number, default: 0 },
    subjectiveMarks: { type: Number, default: 0 },
    isPassing: { type: Boolean, required: true },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const TestAttemptSchema = new Schema<TestAttemptDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    testId: {
      type: Schema.Types.ObjectId,
      ref: "OnlineTest",
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    attemptNumber: { type: Number, required: true, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "auto_submitted", "graded"],
      default: "in_progress",
    },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    sections: { type: [AttemptSectionProgressSchema], default: [] },
    answers: { type: [AttemptAnswerSchema], default: [] },
    result: { type: AttemptResultSchema, default: null },
    questionOrder: {
      type: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      default: [],
    },
    optionOrders: { type: Schema.Types.Mixed, default: {} },
    currentSectionIndex: { type: Number, default: 0, min: 0 },
    autoSavedAt: { type: Date, default: null },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    gradedBy: { type: String, default: null, lowercase: true, trim: true },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

TestAttemptSchema.index(
  { testId: 1, studentId: 1, attemptNumber: 1 },
  { unique: true }
);
TestAttemptSchema.index({ testId: 1, status: 1 });
TestAttemptSchema.index({ studentId: 1, status: 1, createdAt: -1 });
TestAttemptSchema.index({ testId: 1, "result.marksObtained": -1 });

// Phase 7 analytics compound indexes
TestAttemptSchema.index({ companyId: 1, studentId: 1, status: 1 });
TestAttemptSchema.index({ companyId: 1, testId: 1, studentId: 1 });
TestAttemptSchema.index({ companyId: 1, "answers.questionId": 1, status: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const TestAttemptModel =
  (models.TestAttempt as Model<TestAttemptDocument>) ||
  model<TestAttemptDocument>("TestAttempt", TestAttemptSchema);
