// Full schema designed in Phase 2
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface PaperSetDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  papers: Types.ObjectId[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaperSetSchema = new Schema<PaperSetDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    papers: [{ type: Schema.Types.ObjectId, ref: "Paper" }],
    createdBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PaperSetSchema.index({ tenantId: 1, companyId: 1 });
PaperSetSchema.index({ companyId: 1 });

export const PaperSetModel =
  (models.PaperSet as Model<PaperSetDocument>) ||
  model<PaperSetDocument>("PaperSet", PaperSetSchema);
