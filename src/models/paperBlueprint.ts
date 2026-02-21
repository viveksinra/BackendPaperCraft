// Full schema designed in Phase 2
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface PaperBlueprintDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  name: string;
  sections: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaperBlueprintSchema = new Schema<PaperBlueprintDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    sections: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PaperBlueprintSchema.index({ tenantId: 1, companyId: 1 });
PaperBlueprintSchema.index({ companyId: 1 });

export const PaperBlueprintModel =
  (models.PaperBlueprint as Model<PaperBlueprintDocument>) ||
  model<PaperBlueprintDocument>("PaperBlueprint", PaperBlueprintSchema);
