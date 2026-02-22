import { Document, Model, Schema, Types, model, models } from "mongoose";

// ─── Sub-document interfaces ────────────────────────────────────────────────

export interface TopicPerformance {
  subjectId: Types.ObjectId;
  subjectName: string;
  chapterId: Types.ObjectId | null;
  chapterName: string;
  topicId: Types.ObjectId | null;
  topicName: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  averageTimeSeconds: number;
}

export interface SectionScore {
  sectionName: string;
  score: number;
  totalMarks: number;
  percentage: number;
}

export interface TestPerformanceEntry {
  testId: Types.ObjectId;
  testTitle: string;
  testMode: string;
  completedAt: Date;
  score: number;
  totalMarks: number;
  percentage: number;
  rank: number | null;
  percentile: number | null;
  totalStudents: number | null;
  timeTakenSeconds: number;
  sectionScores: SectionScore[];
}

export interface SubjectBreakdown {
  subjectId: Types.ObjectId;
  subjectName: string;
  testCount: number;
  averagePercentage: number;
  trend: number;
}

export interface OverallStats {
  totalTestsTaken: number;
  averagePercentage: number;
  bestPercentage: number;
  worstPercentage: number;
  averageTimePerQuestion: number;
  improvementRate: number;
  classAverageComparison: number;
  percentileInClass: number;
  percentileInOrg: number;
}

export interface DifficultyBucket {
  total: number;
  correct: number;
  accuracy: number;
}

export interface DifficultyAnalysis {
  easy: DifficultyBucket;
  medium: DifficultyBucket;
  hard: DifficultyBucket;
  expert: DifficultyBucket;
}

export interface TimeDistributionBucket {
  label: string;
  count: number;
}

export interface TimeAnalysis {
  averageTimePerQuestion: number;
  classAverageTimePerQuestion: number;
  fastestQuestionTime: number;
  slowestQuestionTime: number;
  timeDistribution: TimeDistributionBucket[];
}

export interface ElevenPlusAnalytics {
  qualificationBand: string;
  predictedScore: number;
  componentScores: Array<{
    component: string;
    avgPercentage: number;
    testCount: number;
    trend: number;
  }>;
  cohortPercentile: number;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface StudentAnalyticsSnapshotDocument extends Document {
  tenantId: string;
  companyId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  period: string;
  testPerformance: TestPerformanceEntry[];
  topicPerformance: TopicPerformance[];
  subjectBreakdown: SubjectBreakdown[];
  overallStats: OverallStats;
  difficultyAnalysis: DifficultyAnalysis;
  timeAnalysis: TimeAnalysis;
  elevenPlusAnalytics: ElevenPlusAnalytics | null;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ───────────────────────────────────────────────────

const SectionScoreSchema = new Schema<SectionScore>(
  {
    sectionName: { type: String, required: true },
    score: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    percentage: { type: Number, required: true },
  },
  { _id: false }
);

const TopicPerformanceSchema = new Schema<TopicPerformance>(
  {
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectName: { type: String, required: true },
    chapterId: { type: Schema.Types.ObjectId, default: null },
    chapterName: { type: String, default: "" },
    topicId: { type: Schema.Types.ObjectId, default: null },
    topicName: { type: String, default: "" },
    totalQuestions: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    averageTimeSeconds: { type: Number, default: 0 },
  },
  { _id: false }
);

const TestPerformanceEntrySchema = new Schema<TestPerformanceEntry>(
  {
    testId: { type: Schema.Types.ObjectId, required: true },
    testTitle: { type: String, required: true },
    testMode: { type: String, required: true },
    completedAt: { type: Date, required: true },
    score: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    percentage: { type: Number, required: true },
    rank: { type: Number, default: null },
    percentile: { type: Number, default: null },
    totalStudents: { type: Number, default: null },
    timeTakenSeconds: { type: Number, default: 0 },
    sectionScores: { type: [SectionScoreSchema], default: [] },
  },
  { _id: false }
);

const SubjectBreakdownSchema = new Schema<SubjectBreakdown>(
  {
    subjectId: { type: Schema.Types.ObjectId, required: true },
    subjectName: { type: String, required: true },
    testCount: { type: Number, default: 0 },
    averagePercentage: { type: Number, default: 0 },
    trend: { type: Number, default: 0 },
  },
  { _id: false }
);

const DifficultyBucketSchema = new Schema<DifficultyBucket>(
  {
    total: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
  },
  { _id: false }
);

const TimeDistributionBucketSchema = new Schema<TimeDistributionBucket>(
  {
    label: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Main schema ────────────────────────────────────────────────────────────

const StudentAnalyticsSnapshotSchema =
  new Schema<StudentAnalyticsSnapshotDocument>(
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
        index: true,
      },
      period: { type: String, required: true, default: "all_time" },
      testPerformance: { type: [TestPerformanceEntrySchema], default: [] },
      topicPerformance: { type: [TopicPerformanceSchema], default: [] },
      subjectBreakdown: { type: [SubjectBreakdownSchema], default: [] },
      overallStats: {
        totalTestsTaken: { type: Number, default: 0 },
        averagePercentage: { type: Number, default: 0 },
        bestPercentage: { type: Number, default: 0 },
        worstPercentage: { type: Number, default: 0 },
        averageTimePerQuestion: { type: Number, default: 0 },
        improvementRate: { type: Number, default: 0 },
        classAverageComparison: { type: Number, default: 0 },
        percentileInClass: { type: Number, default: 0 },
        percentileInOrg: { type: Number, default: 0 },
      },
      difficultyAnalysis: {
        easy: { type: DifficultyBucketSchema, default: () => ({}) },
        medium: { type: DifficultyBucketSchema, default: () => ({}) },
        hard: { type: DifficultyBucketSchema, default: () => ({}) },
        expert: { type: DifficultyBucketSchema, default: () => ({}) },
      },
      timeAnalysis: {
        averageTimePerQuestion: { type: Number, default: 0 },
        classAverageTimePerQuestion: { type: Number, default: 0 },
        fastestQuestionTime: { type: Number, default: 0 },
        slowestQuestionTime: { type: Number, default: 0 },
        timeDistribution: {
          type: [TimeDistributionBucketSchema],
          default: [],
        },
      },
      elevenPlusAnalytics: { type: Schema.Types.Mixed, default: null },
      computedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  );

// ─── Indexes ────────────────────────────────────────────────────────────────

StudentAnalyticsSnapshotSchema.index(
  { studentUserId: 1, companyId: 1, period: 1 },
  { unique: true }
);
StudentAnalyticsSnapshotSchema.index({
  companyId: 1,
  period: 1,
  "overallStats.percentileInOrg": -1,
});

// ─── Export ─────────────────────────────────────────────────────────────────

export const StudentAnalyticsSnapshotModel =
  (models.StudentAnalyticsSnapshot as Model<StudentAnalyticsSnapshotDocument>) ||
  model<StudentAnalyticsSnapshotDocument>(
    "StudentAnalyticsSnapshot",
    StudentAnalyticsSnapshotSchema
  );
