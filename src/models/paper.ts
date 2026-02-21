// Full schema designed in Phase 2
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface PaperDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  sections: Record<string, unknown>;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaperSchema = new Schema<PaperDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    title: { type: String, required: true, trim: true },
    sections: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "draft" },
    createdBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PaperSchema.index({ tenantId: 1, companyId: 1 });
PaperSchema.index({ companyId: 1, status: 1 });

export const PaperModel =
  (models.Paper as Model<PaperDocument>) ||
  model<PaperDocument>("Paper", PaperSchema);
