import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Sub-document interfaces ───────────────────────────────────────────────

export interface PointRule {
  action: string;
  points: number;
  maxPerDay: number;
  description: string;
  isActive: boolean;
}

export interface LevelDefinition {
  level: number;
  name: string;
  pointsRequired: number;
  icon: string;
  color: string;
}

export interface BadgeDefinition {
  badgeId: string;
  name: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  criteria: {
    type: string;
    threshold: number;
    field: string;
  };
  isActive: boolean;
}

export interface StreakConfig {
  requiredActivities: string[];
  gracePeriodHours: number;
  milestones: { days: number; bonusPoints: number; badgeId: string }[];
}

export interface LeaderboardConfig {
  enabled: boolean;
  resetFrequency: "weekly" | "monthly" | "term" | "never";
  showTopN: number;
  anonymizeRanks: boolean;
  minParticipants: number;
}

// ─── Document interface ────────────────────────────────────────────────────

export interface GamificationConfigDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  isEnabled: boolean;
  pointRules: PointRule[];
  levels: LevelDefinition[];
  badges: BadgeDefinition[];
  streakConfig: StreakConfig;
  leaderboardConfig: LeaderboardConfig;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────

const PointRuleSchema = new Schema<PointRule>(
  {
    action: { type: String, required: true },
    points: { type: Number, required: true, min: 0 },
    maxPerDay: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const LevelDefinitionSchema = new Schema<LevelDefinition>(
  {
    level: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    pointsRequired: { type: Number, required: true, min: 0 },
    icon: { type: String, default: "" },
    color: { type: String, default: "#4CAF50" },
  },
  { _id: false }
);

const BadgeCriteriaSchema = new Schema(
  {
    type: { type: String, required: true },
    threshold: { type: Number, required: true, min: 0 },
    field: { type: String, default: "" },
  },
  { _id: false }
);

const BadgeDefinitionSchema = new Schema<BadgeDefinition>(
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
    criteria: { type: BadgeCriteriaSchema, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const StreakMilestoneSchema = new Schema(
  {
    days: { type: Number, required: true, min: 1 },
    bonusPoints: { type: Number, default: 0, min: 0 },
    badgeId: { type: String, default: "" },
  },
  { _id: false }
);

const StreakConfigSchema = new Schema<StreakConfig>(
  {
    requiredActivities: {
      type: [String],
      default: ["test_completed", "homework_submitted", "course_lesson_completed"],
    },
    gracePeriodHours: { type: Number, default: 24, min: 0 },
    milestones: { type: [StreakMilestoneSchema], default: [] },
  },
  { _id: false }
);

const LeaderboardConfigSchema = new Schema<LeaderboardConfig>(
  {
    enabled: { type: Boolean, default: true },
    resetFrequency: {
      type: String,
      enum: ["weekly", "monthly", "term", "never"],
      default: "weekly",
    },
    showTopN: { type: Number, default: 50, min: 5, max: 200 },
    anonymizeRanks: { type: Boolean, default: false },
    minParticipants: { type: Number, default: 3, min: 1 },
  },
  { _id: false }
);

// ─── Main schema ───────────────────────────────────────────────────────────

const GamificationConfigSchema = new Schema<GamificationConfigDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    isEnabled: { type: Boolean, default: true },
    pointRules: {
      type: [PointRuleSchema],
      default: () => [
        { action: "test_completed", points: 10, maxPerDay: 5, description: "Complete a test", isActive: true },
        { action: "test_passed", points: 20, maxPerDay: 5, description: "Pass a test (>50%)", isActive: true },
        { action: "test_perfect_score", points: 50, maxPerDay: 3, description: "Score 100% on a test", isActive: true },
        { action: "homework_submitted", points: 10, maxPerDay: 5, description: "Submit homework", isActive: true },
        { action: "homework_on_time", points: 5, maxPerDay: 5, description: "Submit homework before deadline", isActive: true },
        { action: "course_lesson_completed", points: 5, maxPerDay: 20, description: "Complete a course lesson", isActive: true },
        { action: "course_completed", points: 100, maxPerDay: 2, description: "Complete an entire course", isActive: true },
        { action: "discussion_post", points: 5, maxPerDay: 3, description: "Create a discussion post", isActive: true },
        { action: "discussion_reply", points: 3, maxPerDay: 10, description: "Reply to a discussion", isActive: true },
        { action: "daily_login", points: 2, maxPerDay: 1, description: "Daily login bonus", isActive: true },
      ],
    },
    levels: {
      type: [LevelDefinitionSchema],
      default: () => [
        { level: 1, name: "Beginner", pointsRequired: 0, icon: "seedling", color: "#8BC34A" },
        { level: 2, name: "Learner", pointsRequired: 100, icon: "book", color: "#4CAF50" },
        { level: 3, name: "Explorer", pointsRequired: 300, icon: "compass", color: "#2196F3" },
        { level: 4, name: "Achiever", pointsRequired: 600, icon: "star", color: "#FF9800" },
        { level: 5, name: "Scholar", pointsRequired: 1000, icon: "graduation-cap", color: "#9C27B0" },
        { level: 6, name: "Expert", pointsRequired: 2000, icon: "trophy", color: "#F44336" },
        { level: 7, name: "Master", pointsRequired: 5000, icon: "crown", color: "#FFD700" },
      ],
    },
    badges: {
      type: [BadgeDefinitionSchema],
      default: () => [
        { badgeId: "first_test", name: "Test Taker", description: "Complete your first test", icon: "clipboard-check", tier: "bronze", criteria: { type: "count", threshold: 1, field: "test_completed" }, isActive: true },
        { badgeId: "ten_tests", name: "Test Veteran", description: "Complete 10 tests", icon: "clipboard-list", tier: "silver", criteria: { type: "count", threshold: 10, field: "test_completed" }, isActive: true },
        { badgeId: "perfect_score", name: "Perfectionist", description: "Score 100% on any test", icon: "check-circle", tier: "gold", criteria: { type: "count", threshold: 1, field: "test_perfect_score" }, isActive: true },
        { badgeId: "streak_7", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "flame", tier: "bronze", criteria: { type: "streak", threshold: 7, field: "currentStreak" }, isActive: true },
        { badgeId: "streak_30", name: "Monthly Master", description: "Maintain a 30-day streak", icon: "fire", tier: "gold", criteria: { type: "streak", threshold: 30, field: "currentStreak" }, isActive: true },
        { badgeId: "first_course", name: "Course Graduate", description: "Complete your first course", icon: "award", tier: "silver", criteria: { type: "count", threshold: 1, field: "course_completed" }, isActive: true },
        { badgeId: "helper", name: "Helpful Hand", description: "Get 10 upvotes on discussions", icon: "heart", tier: "bronze", criteria: { type: "count", threshold: 10, field: "discussion_upvote_received" }, isActive: true },
      ],
    },
    streakConfig: {
      type: StreakConfigSchema,
      default: () => ({
        requiredActivities: ["test_completed", "homework_submitted", "course_lesson_completed"],
        gracePeriodHours: 24,
        milestones: [
          { days: 7, bonusPoints: 25, badgeId: "streak_7" },
          { days: 14, bonusPoints: 50, badgeId: "" },
          { days: 30, bonusPoints: 100, badgeId: "streak_30" },
          { days: 60, bonusPoints: 200, badgeId: "" },
          { days: 100, bonusPoints: 500, badgeId: "" },
        ],
      }),
    },
    leaderboardConfig: {
      type: LeaderboardConfigSchema,
      default: () => ({
        enabled: true,
        resetFrequency: "weekly",
        showTopN: 50,
        anonymizeRanks: false,
        minParticipants: 3,
      }),
    },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    updatedBy: { type: String, required: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────

GamificationConfigSchema.index(
  { tenantId: 1, companyId: 1 },
  { unique: true }
);

// ─── Export ────────────────────────────────────────────────────────────────

export const GamificationConfigModel =
  (models.GamificationConfig as Model<GamificationConfigDocument>) ||
  model<GamificationConfigDocument>(
    "GamificationConfig",
    GamificationConfigSchema
  );
