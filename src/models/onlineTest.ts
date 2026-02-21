import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export const TEST_MODES = [
  "live_mock",
  "anytime_mock",
  "practice",
  "classroom",
  "section_timed",
] as const;

export type TestMode = (typeof TEST_MODES)[number];

export type TestStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "completed"
  | "archived";

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface TestScheduling {
  startTime: Date | null;
  endTime: Date | null;
  availableFrom: Date | null;
  duration: number; // minutes
}

export interface TestSection {
  name: string;
  questionIds: Types.ObjectId[];
  timeLimit: number; // minutes, 0 = no limit
  instructions: string;
  canGoBack: boolean;
}

export interface TestOptions {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showResultsAfterCompletion: boolean;
  showSolutionsAfterCompletion: boolean;
  showResultsToParents: boolean;
  instantFeedback: boolean;
  allowReview: boolean;
  maxAttempts: number;
  passingScore: number; // percentage
}

export interface TestAssignment {
  classIds: Types.ObjectId[];
  studentIds: Types.ObjectId[];
  isPublic: boolean;
}

export interface TestGrading {
  requireManualGrading: boolean;
  gradingDeadline: Date | null;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface OnlineTestDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  description: string;
  paperId: Types.ObjectId | null;
  mode: TestMode;
  scheduling: TestScheduling;
  sections: TestSection[];
  options: TestOptions;
  assignment: TestAssignment;
  grading: TestGrading;
  status: TestStatus;
  resultsPublished: boolean;
  totalMarks: number;
  totalQuestions: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const TestSchedulingSchema = new Schema(
  {
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    availableFrom: { type: Date, default: null },
    duration: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const TestSectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    questionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      default: [],
    },
    timeLimit: { type: Number, default: 0, min: 0 },
    instructions: { type: String, default: "", maxlength: 5000 },
    canGoBack: { type: Boolean, default: true },
  },
  { _id: false }
);

const TestOptionsSchema = new Schema(
  {
    randomizeQuestions: { type: Boolean, default: false },
    randomizeOptions: { type: Boolean, default: false },
    showResultsAfterCompletion: { type: Boolean, default: true },
    showSolutionsAfterCompletion: { type: Boolean, default: false },
    showResultsToParents: { type: Boolean, default: true },
    instantFeedback: { type: Boolean, default: false },
    allowReview: { type: Boolean, default: true },
    maxAttempts: { type: Number, default: 1, min: 1 },
    passingScore: { type: Number, default: 40, min: 0, max: 100 },
  },
  { _id: false }
);

const TestAssignmentSchema = new Schema(
  {
    classIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Class" }],
      default: [],
    },
    studentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Student" }],
      default: [],
    },
    isPublic: { type: Boolean, default: false },
  },
  { _id: false }
);

const TestGradingSchema = new Schema(
  {
    requireManualGrading: { type: Boolean, default: false },
    gradingDeadline: { type: Date, default: null },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const OnlineTestSchema = new Schema<OnlineTestDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", default: null },
    mode: {
      type: String,
      enum: TEST_MODES,
      required: true,
    },
    scheduling: { type: TestSchedulingSchema, default: () => ({}) },
    sections: { type: [TestSectionSchema], default: [] },
    options: { type: TestOptionsSchema, default: () => ({}) },
    assignment: { type: TestAssignmentSchema, default: () => ({}) },
    grading: { type: TestGradingSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["draft", "scheduled", "live", "completed", "archived"],
      default: "draft",
    },
    resultsPublished: { type: Boolean, default: false },
    totalMarks: { type: Number, default: 0, min: 0 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

OnlineTestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
OnlineTestSchema.index({ companyId: 1, mode: 1, status: 1 });
OnlineTestSchema.index({ "assignment.classIds": 1 });
OnlineTestSchema.index({ "assignment.studentIds": 1 });
OnlineTestSchema.index({ "scheduling.startTime": 1, status: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const OnlineTestModel =
  (models.OnlineTest as Model<OnlineTestDocument>) ||
  model<OnlineTestDocument>("OnlineTest", OnlineTestSchema);
