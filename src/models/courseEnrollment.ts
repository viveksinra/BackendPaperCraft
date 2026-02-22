import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type EnrollmentStatus = "active" | "completed" | "dropped";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface LessonProgress {
  lessonId: Types.ObjectId;
  sectionId: Types.ObjectId;
  completedAt: Date;
  timeSpentSeconds: number;
  quizScore: number | null;
}

export interface CourseProgress {
  completedLessons: LessonProgress[];
  currentSectionId: Types.ObjectId | null;
  currentLessonId: Types.ObjectId | null;
  percentComplete: number;
  lastAccessedAt: Date | null;
  totalTimeSpentSeconds: number;
}

export interface CourseCertificate {
  issued: boolean;
  issuedAt: Date | null;
  certificateUrl: string;
  certificateNumber: string;
}

export interface CourseReview {
  rating: number;
  reviewText: string;
  reviewedAt: Date;
  isVisible: boolean;
}

// ─── Document interface ────────────────────────────────────────────────────

export interface CourseEnrollmentDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  courseId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  enrolledByUserId: Types.ObjectId;
  purchaseId: Types.ObjectId | null;
  status: EnrollmentStatus;
  progress: CourseProgress;
  certificate: CourseCertificate;
  review: CourseReview | null;
  enrolledAt: Date;
  completedAt: Date | null;
  droppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const LessonProgressSchema = new Schema(
  {
    lessonId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    completedAt: { type: Date, required: true },
    timeSpentSeconds: { type: Number, default: 0, min: 0 },
    quizScore: { type: Number, default: null, min: 0, max: 100 },
  },
  { _id: false }
);

const CourseProgressSchema = new Schema(
  {
    completedLessons: { type: [LessonProgressSchema], default: [] },
    currentSectionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    currentLessonId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    percentComplete: { type: Number, default: 0, min: 0, max: 100 },
    lastAccessedAt: { type: Date, default: null },
    totalTimeSpentSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const CourseCertificateSchema = new Schema(
  {
    issued: { type: Boolean, default: false },
    issuedAt: { type: Date, default: null },
    certificateUrl: { type: String, default: "" },
    certificateNumber: { type: String, default: "" },
  },
  { _id: false }
);

const CourseReviewSchema = new Schema(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, default: "", maxlength: 2000 },
    reviewedAt: { type: Date, required: true },
    isVisible: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const CourseEnrollmentSchema = new Schema<CourseEnrollmentDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    enrolledByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: "Purchase",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "completed", "dropped"],
      default: "active",
    },
    progress: { type: CourseProgressSchema, default: () => ({}) },
    certificate: { type: CourseCertificateSchema, default: () => ({}) },
    review: { type: CourseReviewSchema, default: null },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    droppedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

CourseEnrollmentSchema.index(
  { tenantId: 1, companyId: 1, courseId: 1, studentUserId: 1 },
  { unique: true }
);
CourseEnrollmentSchema.index({ tenantId: 1, companyId: 1, studentUserId: 1, status: 1 });
CourseEnrollmentSchema.index({ tenantId: 1, companyId: 1, courseId: 1, status: 1 });
CourseEnrollmentSchema.index({ courseId: 1, "review.rating": 1 });
CourseEnrollmentSchema.index({ courseId: 1, completedAt: -1 });
CourseEnrollmentSchema.index(
  { "certificate.certificateNumber": 1 },
  { sparse: true }
);

// ─── Export ────────────────────────────────────────────────────────────────

export const CourseEnrollmentModel =
  (models.CourseEnrollment as Model<CourseEnrollmentDocument>) ||
  model<CourseEnrollmentDocument>("CourseEnrollment", CourseEnrollmentSchema);
