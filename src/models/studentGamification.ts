import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Type Aliases ──────────────────────────────────────────────────────────

export type PointSource =
  | "test_completed"
  | "test_passed"
  | "test_perfect_score"
  | "homework_submitted"
  | "homework_on_time"
  | "course_lesson_completed"
  | "course_completed"
  | "discussion_post"
  | "discussion_reply"
  | "discussion_upvote_received"
  | "daily_login"
  | "streak_bonus"
  | "badge_bonus"
  | "manual_award";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface PointEntry {
  source: PointSource;
  points: number;
  description: string;
  referenceType: string;
  referenceId: string;
  awardedAt: Date;
}

export interface BadgeAward {
  badgeId: string;
  name: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  earnedAt: Date;
}

export interface StreakHistory {
  date: Date;
  activityType: string;
  maintained: boolean;
}

// ─── Document interface ────────────────────────────────────────────────────

export interface StudentGamificationDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  totalPoints: number;
  level: number;
  levelName: string;
  pointsToNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
  streakHistory: StreakHistory[];
  badges: BadgeAward[];
  pointHistory: PointEntry[];
  weeklyPoints: number;
  monthlyPoints: number;
  weekResetAt: Date;
  monthResetAt: Date;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const PointEntrySchema = new Schema<PointEntry>(
  {
    source: {
      type: String,
      enum: [
        "test_completed",
        "test_passed",
        "test_perfect_score",
        "homework_submitted",
        "homework_on_time",
        "course_lesson_completed",
        "course_completed",
        "discussion_post",
        "discussion_reply",
        "discussion_upvote_received",
        "daily_login",
        "streak_bonus",
        "badge_bonus",
        "manual_award",
      ],
      required: true,
    },
    points: { type: Number, required: true },
    description: { type: String, default: "" },
    referenceType: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    awardedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const BadgeAwardSchema = new Schema<BadgeAward>(
  {
    badgeId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "" },
    tier: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum"],
      default: "bronze",
    },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StreakHistorySchema = new Schema<StreakHistory>(
  {
    date: { type: Date, required: true },
    activityType: { type: String, default: "" },
    maintained: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const StudentGamificationSchema = new Schema<StudentGamificationDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalPoints: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    levelName: { type: String, default: "Beginner" },
    pointsToNextLevel: { type: Number, default: 100 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActivityDate: { type: Date, default: null },
    streakHistory: { type: [StreakHistorySchema], default: [] },
    badges: { type: [BadgeAwardSchema], default: [] },
    pointHistory: { type: [PointEntrySchema], default: [] },
    weeklyPoints: { type: Number, default: 0, min: 0 },
    monthlyPoints: { type: Number, default: 0, min: 0 },
    weekResetAt: { type: Date, default: Date.now },
    monthResetAt: { type: Date, default: Date.now },
    rank: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

StudentGamificationSchema.index(
  { tenantId: 1, companyId: 1, studentUserId: 1 },
  { unique: true }
);
StudentGamificationSchema.index({ tenantId: 1, companyId: 1, totalPoints: -1 });
StudentGamificationSchema.index({ tenantId: 1, companyId: 1, weeklyPoints: -1 });
StudentGamificationSchema.index({ tenantId: 1, companyId: 1, monthlyPoints: -1 });
StudentGamificationSchema.index({ tenantId: 1, companyId: 1, level: -1 });
StudentGamificationSchema.index({ tenantId: 1, companyId: 1, currentStreak: -1 });

// ─── Export ────────────────────────────────────────────────────────────────

export const StudentGamificationModel =
  (models.StudentGamification as Model<StudentGamificationDocument>) ||
  model<StudentGamificationDocument>(
    "StudentGamification",
    StudentGamificationSchema
  );
