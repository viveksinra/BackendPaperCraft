// Full schema designed in Phase 3
import { Document, Model, Schema, Types, model, models } from "mongoose";

export interface TestAttemptDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  testId: Types.ObjectId;
  studentId: Types.ObjectId;
  answers: Record<string, unknown>;
  score: Record<string, unknown>;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TestAttemptSchema = new Schema<TestAttemptDocument>(
  {
    tenantId: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    testId: { type: Schema.Types.ObjectId, ref: "OnlineTest", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    score: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "not_started" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TestAttemptSchema.index({ tenantId: 1, companyId: 1 });
TestAttemptSchema.index({ companyId: 1, testId: 1 });
TestAttemptSchema.index({ studentId: 1, testId: 1 });

export const TestAttemptModel =
  (models.TestAttempt as Model<TestAttemptDocument>) ||
  model<TestAttemptDocument>("TestAttempt", TestAttemptSchema);
