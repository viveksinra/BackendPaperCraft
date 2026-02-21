// Full schema designed in Phase 3
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface OnlineTestDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  title: string;
  config: Record<string, unknown>;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const OnlineTestSchema = new Schema<OnlineTestDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    title: { type: String, required: true, trim: true },
    config: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "draft" },
    createdBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

OnlineTestSchema.index({ tenantId: 1, companyId: 1 });
OnlineTestSchema.index({ companyId: 1, status: 1 });

export const OnlineTestModel =
  (models.OnlineTest as Model<OnlineTestDocument>) ||
  model<OnlineTestDocument>("OnlineTest", OnlineTestSchema);
