import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Constants & Types ──────────────────────────────────────────────────────

export type ClassStatus = "active" | "archived";

// ─── Sub-interfaces ─────────────────────────────────────────────────────────

export interface ClassSchedule {
  dayOfWeek: string[];
  time: string;
  location: string;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface ClassDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  yearGroup: string;
  subject: string;
  schedule: ClassSchedule;
  students: Types.ObjectId[];
  teachers: Types.ObjectId[];
  studentCount: number;
  status: ClassStatus;
  archivedAt: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const ClassScheduleSchema = new Schema<ClassSchedule>(
  {
    dayOfWeek: { type: [String], default: [] },
    time: { type: String, default: "" },
    location: { type: String, default: "" },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const ClassSchema = new Schema<ClassDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: "", maxlength: 2000 },
    yearGroup: { type: String, default: "" },
    subject: { type: String, default: "" },
    schedule: {
      type: ClassScheduleSchema,
      default: () => ({ dayOfWeek: [], time: "", location: "" }),
    },
    students: [{ type: Schema.Types.ObjectId, ref: "User" }],
    teachers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    studentCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    archivedAt: { type: Date, default: null },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

ClassSchema.index({ companyId: 1, status: 1 });
ClassSchema.index({ companyId: 1, slug: 1 }, { unique: true });
ClassSchema.index({ companyId: 1, students: 1 });
ClassSchema.index({ companyId: 1, teachers: 1 });

// ─── Export ─────────────────────────────────────────────────────────────────

export const ClassModel =
  (models.Class as Model<ClassDocument>) ||
  model<ClassDocument>("Class", ClassSchema);
