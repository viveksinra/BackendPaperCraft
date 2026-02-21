// Full schema designed in Phase 2
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface PaperTemplateDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  layout: Record<string, unknown>;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaperTemplateSchema = new Schema<PaperTemplateDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    layout: { type: Schema.Types.Mixed, default: {} },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PaperTemplateSchema.index({ tenantId: 1, companyId: 1 });
PaperTemplateSchema.index({ companyId: 1 });

export const PaperTemplateModel =
  (models.PaperTemplate as Model<PaperTemplateDocument>) ||
  model<PaperTemplateDocument>("PaperTemplate", PaperTemplateSchema);
