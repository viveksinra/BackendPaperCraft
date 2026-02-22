import { Document, Model, Schema, Types, model, models } from "mongoose";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface StudentOrganization {
  companyId: Types.ObjectId;
  tenantId: string;
  joinedAt: Date;
  role: string;
  orgName: string;
  isActive: boolean;
}

export interface StudentDocument extends Document {
  userId: Types.ObjectId;
  studentCode: string;
  dateOfBirth: Date | null;
  yearGroup: string;
  school: string;
  organizations: StudentOrganization[];
  preferences: {
    showTimerWarning: boolean;
    questionFontSize: "small" | "medium" | "large";
    highContrastMode: boolean;
  };
  stats: {
    totalTestsTaken: number;
    averageScore: number;
    currentStreak: number;
    longestStreak: number;
    lastActivityAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const StudentOrganizationSchema = new Schema<StudentOrganization>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    tenantId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, default: "student" },
    orgName: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

// ── Main schema ─────────────────────────────────────────────────────────────

const StudentSchema = new Schema<StudentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    studentCode: { type: String, required: true, uppercase: true, trim: true },
    dateOfBirth: { type: Date, default: null },
    yearGroup: { type: String, default: "" },
    school: { type: String, default: "" },
    organizations: { type: [StudentOrganizationSchema], default: [] },
    preferences: {
      type: new Schema(
        {
          showTimerWarning: { type: Boolean, default: true },
          questionFontSize: {
            type: String,
            enum: ["small", "medium", "large"],
            default: "medium",
          },
          highContrastMode: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: () => ({
        showTimerWarning: true,
        questionFontSize: "medium",
        highContrastMode: false,
      }),
    },
    stats: {
      type: new Schema(
        {
          totalTestsTaken: { type: Number, default: 0 },
          averageScore: { type: Number, default: 0 },
          currentStreak: { type: Number, default: 0 },
          longestStreak: { type: Number, default: 0 },
          lastActivityAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: () => ({
        totalTestsTaken: 0,
        averageScore: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityAt: null,
      }),
    },
  },
  { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────────────────────────

StudentSchema.index({ userId: 1 }, { unique: true });
StudentSchema.index({ studentCode: 1 }, { unique: true });
StudentSchema.index({ "organizations.companyId": 1 });

// ── Export ───────────────────────────────────────────────────────────────────

export const StudentModel =
  (models.Student as Model<StudentDocument>) ||
  model<StudentDocument>("Student", StudentSchema);
