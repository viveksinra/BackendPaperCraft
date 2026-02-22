import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type SubmissionStatus = "pending" | "submitted" | "late" | "graded";

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface HomeworkAnswer {
  questionId: Types.ObjectId;
  answer: unknown;
  isCorrect: boolean | null;
  marksAwarded: number;
  maxMarks: number;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface HomeworkSubmissionDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  homeworkId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  testAttemptId: Types.ObjectId | null;
  status: SubmissionStatus;
  answers: HomeworkAnswer[];
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  submittedAt: Date | null;
  gradedAt: Date | null;
  gradedBy: string;
  feedback: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const HomeworkAnswerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    answer: { type: Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, default: null },
    marksAwarded: { type: Number, default: 0, min: 0 },
    maxMarks: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const HomeworkSubmissionSchema = new Schema<HomeworkSubmissionDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    homeworkId: {
      type: Schema.Types.ObjectId,
      ref: "Homework",
      required: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    testAttemptId: {
      type: Schema.Types.ObjectId,
      ref: "TestAttempt",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "submitted", "late", "graded"],
      default: "pending",
    },
    answers: { type: [HomeworkAnswerSchema], default: [] },
    score: { type: Number, default: null },
    totalMarks: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: null },
    submittedAt: { type: Date, default: null },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: String, default: "" },
    feedback: { type: String, default: "", maxlength: 5000 },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

HomeworkSubmissionSchema.index(
  { homeworkId: 1, studentUserId: 1 },
  { unique: true }
);
HomeworkSubmissionSchema.index({ studentUserId: 1, status: 1 });
HomeworkSubmissionSchema.index({ homeworkId: 1, status: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const HomeworkSubmissionModel =
  (models.HomeworkSubmission as Model<HomeworkSubmissionDocument>) ||
  model<HomeworkSubmissionDocument>(
    "HomeworkSubmission",
    HomeworkSubmissionSchema
  );
