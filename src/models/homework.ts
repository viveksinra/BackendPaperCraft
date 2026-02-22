import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type HomeworkStatus = "active" | "past_due" | "completed" | "archived";
export type HomeworkType = "test" | "questions";

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface SubmissionSummary {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  late: number;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface HomeworkDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  classId: Types.ObjectId;
  title: string;
  description: string;
  type: HomeworkType;
  testId: Types.ObjectId | null;
  questionIds: Types.ObjectId[];
  totalMarks: number;
  assignedAt: Date;
  dueDate: Date;
  lateSubmissionAllowed: boolean;
  lateDeadline: Date | null;
  status: HomeworkStatus;
  submissionSummary: SubmissionSummary;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Main schema ────────────────────────────────────────────────────────────

const HomeworkSchema = new Schema<HomeworkDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", maxlength: 5000 },
    type: {
      type: String,
      enum: ["test", "questions"],
      required: true,
    },
    testId: {
      type: Schema.Types.ObjectId,
      ref: "OnlineTest",
      default: null,
    },
    questionIds: [{ type: Schema.Types.ObjectId, ref: "Question" }],
    totalMarks: { type: Number, default: 0, min: 0 },
    assignedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    lateSubmissionAllowed: { type: Boolean, default: false },
    lateDeadline: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "past_due", "completed", "archived"],
      default: "active",
    },
    submissionSummary: {
      type: new Schema(
        {
          total: { type: Number, default: 0 },
          completed: { type: Number, default: 0 },
          pending: { type: Number, default: 0 },
          overdue: { type: Number, default: 0 },
          late: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        late: 0,
      }),
    },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

HomeworkSchema.index({ companyId: 1, classId: 1, status: 1 });
HomeworkSchema.index({ companyId: 1, dueDate: 1 });
HomeworkSchema.index({ companyId: 1, status: 1, dueDate: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const HomeworkModel =
  (models.Homework as Model<HomeworkDocument>) ||
  model<HomeworkDocument>("Homework", HomeworkSchema);
