// Full schema designed in Phase 5
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface ClassDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  teacherId: Types.ObjectId;
  students: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClassSchema = new Schema<ClassDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    students: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ClassSchema.index({ tenantId: 1, companyId: 1 });
ClassSchema.index({ companyId: 1, teacherId: 1 });

export const ClassModel =
  (models.Class as Model<ClassDocument>) ||
  model<ClassDocument>("Class", ClassSchema);
