// Full schema designed in Phase 1
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface SubjectDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  slug: string;
  level: "subject" | "chapter" | "topic" | "subtopic";
  parentId: Types.ObjectId | null;
  path: Types.ObjectId[];
  sortOrder: number;
  description: string;
  questionCount: number;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<SubjectDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    level: {
      type: String,
      required: true,
      enum: ["subject", "chapter", "topic", "subtopic"],
    },
    parentId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    path: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    sortOrder: { type: Number, default: 0 },
    description: { type: String, default: "" },
    questionCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, lowercase: true, trim: true },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

SubjectSchema.index({ tenantId: 1, companyId: 1 });
SubjectSchema.index({ companyId: 1, parentId: 1 });
SubjectSchema.index({ companyId: 1, slug: 1 }, { unique: true });

export const SubjectModel =
  (models.Subject as Model<SubjectDocument>) ||
  model<SubjectDocument>("Subject", SubjectSchema);
