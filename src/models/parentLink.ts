// Full schema designed in Phase 4
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface ParentLinkDocument extends Document {
  tenantId: string;
  parentUserId: Types.ObjectId;
  childStudentId: Types.ObjectId;
  relationship: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ParentLinkSchema = new Schema<ParentLinkDocument>(
  {
    tenantId: { type: String, required: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    childStudentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    relationship: { type: String, default: "parent" },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ParentLinkSchema.index({ tenantId: 1 });
ParentLinkSchema.index({ parentUserId: 1 });
ParentLinkSchema.index({ childStudentId: 1 });
ParentLinkSchema.index({ parentUserId: 1, childStudentId: 1 }, { unique: true });

export const ParentLinkModel =
  (models.ParentLink as Model<ParentLinkDocument>) ||
  model<ParentLinkDocument>("ParentLink", ParentLinkSchema);
