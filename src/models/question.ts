// Full schema designed in Phase 1
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface QuestionDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  type: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  usage: Record<string, unknown>;
  review: Record<string, unknown>;
  performance: Record<string, unknown>;
  isArchived: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<QuestionDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    type: { type: String, required: true },
    content: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    usage: { type: Schema.Types.Mixed, default: {} },
    review: { type: Schema.Types.Mixed, default: {} },
    performance: { type: Schema.Types.Mixed, default: {} },
    isArchived: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

QuestionSchema.index({ tenantId: 1, companyId: 1 });
QuestionSchema.index({ companyId: 1, type: 1 });

export const QuestionModel =
  (models.Question as Model<QuestionDocument>) ||
  model<QuestionDocument>("Question", QuestionSchema);
