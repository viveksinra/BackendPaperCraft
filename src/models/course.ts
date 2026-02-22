import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type CourseStatus = "draft" | "published" | "archived";
export type CourseLevel = "beginner" | "intermediate" | "advanced" | "all_levels";
export type LessonType = "video" | "pdf" | "text" | "quiz" | "resource";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface LessonContent {
  videoUrl: string;
  videoDuration: number;
  videoThumbnailUrl: string;
  pdfUrl: string;
  pdfPageCount: number;
  textContent: string;
  testId: Types.ObjectId | null;
  resourceFiles: {
    name: string;
    url: string;
    fileSize: number;
    mimeType: string;
  }[];
}

export interface Lesson {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  type: LessonType;
  order: number;
  content: LessonContent;
  isFree: boolean;
  dripDate: Date | null;
  estimatedMinutes: number;
  isPublished: boolean;
}

export interface Section {
  _id: Types.ObjectId;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface CoursePricing {
  isFree: boolean;
  price: number;
  currency: string;
  productId: Types.ObjectId | null;
}

export interface CourseStats {
  enrollmentCount: number;
  avgRating: number;
  ratingCount: number;
  completionRate: number;
  totalLessons: number;
  totalDurationMinutes: number;
}

// ─── Document interface ────────────────────────────────────────────────────

export interface CourseDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  thumbnail: string;
  teacherId: Types.ObjectId;
  additionalTeacherIds: Types.ObjectId[];
  category: string;
  tags: string[];
  level: CourseLevel;
  targetExamType: string;
  sections: Section[];
  pricing: CoursePricing;
  stats: CourseStats;
  status: CourseStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  welcomeMessage: string;
  completionMessage: string;
  certificateEnabled: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const ResourceFileSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileSize: { type: Number, default: 0, min: 0 },
    mimeType: { type: String, default: "" },
  },
  { _id: false }
);

const LessonContentSchema = new Schema(
  {
    videoUrl: { type: String, default: "" },
    videoDuration: { type: Number, default: 0, min: 0 },
    videoThumbnailUrl: { type: String, default: "" },
    pdfUrl: { type: String, default: "" },
    pdfPageCount: { type: Number, default: 0, min: 0 },
    textContent: { type: String, default: "" },
    testId: {
      type: Schema.Types.ObjectId,
      ref: "OnlineTest",
      default: null,
    },
    resourceFiles: { type: [ResourceFileSchema], default: [] },
  },
  { _id: false }
);

const LessonSchema = new Schema<Lesson>({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  slug: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ["video", "pdf", "text", "quiz", "resource"],
    required: true,
  },
  order: { type: Number, required: true, min: 0 },
  content: { type: LessonContentSchema, default: () => ({}) },
  isFree: { type: Boolean, default: false },
  dripDate: { type: Date, default: null },
  estimatedMinutes: { type: Number, default: 0, min: 0 },
  isPublished: { type: Boolean, default: true },
});

const SectionSchema = new Schema<Section>({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  order: { type: Number, required: true, min: 0 },
  lessons: { type: [LessonSchema], default: [] },
});

const CoursePricingSchema = new Schema<CoursePricing>(
  {
    isFree: { type: Boolean, default: true },
    price: { type: Number, default: 0, min: 0 },
    currency: {
      type: String,
      enum: ["GBP", "INR"],
      default: "GBP",
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
  },
  { _id: false }
);

const CourseStatsSchema = new Schema<CourseStats>(
  {
    enrollmentCount: { type: Number, default: 0, min: 0 },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 100 },
    totalLessons: { type: Number, default: 0, min: 0 },
    totalDurationMinutes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const CourseSchema = new Schema<CourseDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true },
    description: { type: String, default: "", maxlength: 50000 },
    shortDescription: { type: String, default: "", maxlength: 500 },
    thumbnail: { type: String, default: "" },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    additionalTeacherIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    category: { type: String, default: "", maxlength: 100 },
    tags: { type: [String], default: [] },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all_levels"],
      default: "all_levels",
    },
    targetExamType: { type: String, default: "", maxlength: 100 },
    sections: { type: [SectionSchema], default: [] },
    pricing: { type: CoursePricingSchema, default: () => ({}) },
    stats: { type: CourseStatsSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    welcomeMessage: { type: String, default: "", maxlength: 5000 },
    completionMessage: { type: String, default: "", maxlength: 5000 },
    certificateEnabled: { type: Boolean, default: false },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

CourseSchema.index({ tenantId: 1, companyId: 1, status: 1 });
CourseSchema.index({ tenantId: 1, companyId: 1, teacherId: 1 });
CourseSchema.index(
  { tenantId: 1, companyId: 1, slug: 1 },
  { unique: true }
);
CourseSchema.index({ tenantId: 1, companyId: 1, category: 1 });
CourseSchema.index({ tenantId: 1, companyId: 1, tags: 1 });
CourseSchema.index({ tenantId: 1, companyId: 1, status: 1, "pricing.isFree": 1 });
CourseSchema.index({ "stats.avgRating": -1 });
CourseSchema.index({ "stats.enrollmentCount": -1 });
CourseSchema.index({ publishedAt: -1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const CourseModel =
  (models.Course as Model<CourseDocument>) ||
  model<CourseDocument>("Course", CourseSchema);
