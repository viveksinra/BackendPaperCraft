// Full schema designed in Phase 5
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface HomeworkDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  classId: Types.ObjectId;
  testId: Types.ObjectId;
  dueDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const HomeworkSchema = new Schema<HomeworkDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    title: { type: String, required: true, trim: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    testId: { type: Schema.Types.ObjectId, ref: "OnlineTest", required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, default: "draft" },
  },
  { timestamps: true }
);

HomeworkSchema.index({ tenantId: 1, companyId: 1 });
HomeworkSchema.index({ companyId: 1, classId: 1 });

export const HomeworkModel =
  (models.Homework as Model<HomeworkDocument>) ||
  model<HomeworkDocument>("Homework", HomeworkSchema);
