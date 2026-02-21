// Full schema designed in Phase 4
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface StudentDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  displayName: string;
  grade: string;
  dateOfBirth: Date | null;
  enrollmentDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<StudentDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    displayName: { type: String, required: true, trim: true },
    grade: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    enrollmentDate: { type: Date, default: null },
  },
  { timestamps: true }
);

StudentSchema.index({ tenantId: 1, companyId: 1 });
StudentSchema.index({ companyId: 1, userId: 1 }, { unique: true });

export const StudentModel =
  (models.Student as Model<StudentDocument>) ||
  model<StudentDocument>("Student", StudentSchema);
