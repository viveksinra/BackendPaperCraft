import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';

// ---- Hoisted Mocks ----

const {
  mockTestAttemptModel,
  mockSnapshotModel,
  mockQuestionAnalyticsModel,
  mockQuestionModel,
  mockPurchaseModel,
  mockOnlineTestModel,
  mockClassModel,
  mockUserModel,
  mockHomeworkModel,
  mockMembershipModel,
} = vi.hoisted(() => {
  const mocks = {
    mockTestAttemptModel: { find: vi.fn(), aggregate: vi.fn() } as Record<string, any>,
    mockSnapshotModel: { find: vi.fn() } as Record<string, any>,
    mockQuestionAnalyticsModel: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() } as Record<string, any>,
    mockQuestionModel: { find: vi.fn(), findById: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() } as Record<string, any>,
    mockPurchaseModel: { aggregate: vi.fn() } as Record<string, any>,
    mockOnlineTestModel: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), countDocuments: vi.fn() } as Record<string, any>,
    mockClassModel: { find: vi.fn(), findById: vi.fn() } as Record<string, any>,
    mockUserModel: { find: vi.fn() } as Record<string, any>,
    mockHomeworkModel: { countDocuments: vi.fn() } as Record<string, any>,
    mockMembershipModel: { find: vi.fn() } as Record<string, any>,
  };
  const mongoose = require('mongoose');
  mongoose.models.OnlineTest = mocks.mockOnlineTestModel;
  mongoose.models.Class = mocks.mockClassModel;
  mongoose.models.User = mocks.mockUserModel;
  mongoose.models.Homework = mocks.mockHomeworkModel;
  mongoose.models.Student = {};
  mongoose.models.Membership = mocks.mockMembershipModel;
  return mocks;
});

vi.mock('../../../src/models/testAttempt', () => ({
  TestAttemptModel: mockTestAttemptModel,
}));

vi.mock('../../../src/models/studentAnalyticsSnapshot', () => ({
  StudentAnalyticsSnapshotModel: mockSnapshotModel,
}));

vi.mock('../../../src/models/questionAnalytics', () => ({
  QuestionAnalyticsModel: mockQuestionAnalyticsModel,
}));

vi.mock('../../../src/models/question', () => ({
  QuestionModel: mockQuestionModel,
}));

vi.mock('../../../src/models/purchase', () => ({
  PurchaseModel: mockPurchaseModel,
}));

vi.mock('../../../src/shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));


// ---- Helpers ----

function toObjectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function chainable(resolvedValue: unknown) {
  const obj: Record<string, any> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.populate = vi.fn().mockReturnValue(obj);
  obj.select = vi.fn().mockReturnValue(obj);
  return obj;
}

const companyId = toObjectId();
const classId = toObjectId();
const testId = toObjectId();

// ---- Import service after mocks ----

import {
  getClassAnalytics,
  getClassTestAnalytics,
  getClassTopicHeatmap,
  getClassComparisonAcrossTests,
  getClassStudentRankings,
} from '../../../src/services/classAnalyticsService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getClassAnalytics ───────────────────────────────────────────────

describe('getClassAnalytics', () => {
  it('returns correct student count, test count, homework count', async () => {
    const s1 = toObjectId();
    const s2 = toObjectId();
    const s3 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: classId,
        students: [s1, s2, s3],
      }),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(5);
    mockHomeworkModel.countDocuments.mockResolvedValue(3);

    mockSnapshotModel.find.mockReturnValue(chainable([
      { overallStats: { averagePercentage: 80, improvementRate: 10 } },
      { overallStats: { averagePercentage: 60, improvementRate: -5 } },
      { overallStats: { averagePercentage: 70, improvementRate: 0 } },
    ]));

    const result = await getClassAnalytics(companyId.toString(), classId.toString());

    expect(result.studentCount).toBe(3);
    expect(result.testCount).toBe(5);
    expect(result.homeworkCount).toBe(3);
  });

  it('computes overall average score from snapshots', async () => {
    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [toObjectId(), toObjectId()] }),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(0);
    mockHomeworkModel.countDocuments.mockResolvedValue(0);

    mockSnapshotModel.find.mockReturnValue(chainable([
      { overallStats: { averagePercentage: 80, improvementRate: 0 } },
      { overallStats: { averagePercentage: 60, improvementRate: 0 } },
    ]));

    const result = await getClassAnalytics(companyId.toString(), classId.toString());

    expect(result.overallAverageScore).toBe(70);
  });

  it('handles empty class (no students)', async () => {
    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [] }),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(0);
    mockHomeworkModel.countDocuments.mockResolvedValue(0);
    mockSnapshotModel.find.mockReturnValue(chainable([]));

    const result = await getClassAnalytics(companyId.toString(), classId.toString());

    expect(result.studentCount).toBe(0);
    expect(result.overallAverageScore).toBe(0);
    expect(result.improvementTrend).toBe(0);
  });
});

// ─── getClassTestAnalytics ───────────────────────────────────────────

describe('getClassTestAnalytics', () => {
  it('delegates to computeClassAnalytics', async () => {
    // This is a direct wrapper so we just verify it calls through
    const students = [toObjectId()];
    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students }),
    });
    mockTestAttemptModel.find.mockReturnValue(chainable([
      {
        _id: toObjectId(),
        studentId: students[0],
        testId,
        result: { marksObtained: 8, totalMarks: 10, percentage: 80 },
        answers: [],
      },
    ]));
    mockUserModel.find.mockReturnValue(chainable([{ _id: students[0], name: 'A' }]));
    mockQuestionModel.find.mockReturnValue(chainable([]));

    const result = await getClassTestAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result).toHaveProperty('scoreStats');
    expect(result).toHaveProperty('scoreDistribution');
    expect(result).toHaveProperty('topPerformers');
    expect(result).toHaveProperty('completionRate');
  });
});

// ─── getClassTopicHeatmap ────────────────────────────────────────────

describe('getClassTopicHeatmap', () => {
  it('returns student-topic accuracy matrix filtered by subject', async () => {
    const s1 = toObjectId();
    const subjectId = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [s1] }),
    });
    mockUserModel.find.mockReturnValue(chainable([{ _id: s1, name: 'Alice' }]));

    mockSnapshotModel.find.mockReturnValue(chainable([{
      studentUserId: s1,
      topicPerformance: [
        {
          subjectId,
          subjectName: 'Math',
          topicId: toObjectId(),
          topicName: 'Algebra',
          accuracy: 85,
        },
        {
          subjectId: toObjectId(), // Different subject
          subjectName: 'English',
          topicId: toObjectId(),
          topicName: 'Grammar',
          accuracy: 70,
        },
      ],
    }]));

    const result = await getClassTopicHeatmap(
      companyId.toString(),
      classId.toString(),
      subjectId.toString()
    );

    expect(result.students).toHaveLength(1);
    expect(result.students[0].name).toBe('Alice');
    // Only Math topic should be included (filtered by subject)
    const topicIds = Object.keys(result.students[0].topicAccuracies);
    expect(topicIds.length).toBe(1);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].name).toBe('Algebra');
  });
});

// ─── getClassComparisonAcrossTests ───────────────────────────────────

describe('getClassComparisonAcrossTests', () => {
  it('returns aggregated test comparison data', async () => {
    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [toObjectId()] }),
    });

    const aggregateResult = [
      {
        testId: toObjectId(),
        testTitle: 'Test 1',
        date: '2026-01-15',
        classAvg: 72.5,
        testCount: 10,
      },
    ];

    mockTestAttemptModel.aggregate.mockResolvedValue(aggregateResult);

    const result = await getClassComparisonAcrossTests(
      companyId.toString(),
      classId.toString()
    );

    expect(result).toHaveLength(1);
    expect(result[0].testTitle).toBe('Test 1');
    expect(result[0].classAvg).toBe(72.5);
  });
});

// ─── getClassStudentRankings ─────────────────────────────────────────

describe('getClassStudentRankings', () => {
  it('ranks students by percentage descending with correct ranking', async () => {
    const s1 = toObjectId();
    const s2 = toObjectId();
    const s3 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [s1, s2, s3] }),
    });

    // Already sorted desc
    mockTestAttemptModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            studentId: s1,
            result: { percentage: 90, marksObtained: 9 },
            startedAt: new Date('2026-01-01T10:00:00Z'),
            submittedAt: new Date('2026-01-01T10:30:00Z'),
          },
          {
            studentId: s2,
            result: { percentage: 75, marksObtained: 7.5 },
            startedAt: new Date('2026-01-01T10:00:00Z'),
            submittedAt: new Date('2026-01-01T10:25:00Z'),
          },
          {
            studentId: s3,
            result: { percentage: 75, marksObtained: 7.5 },
            startedAt: new Date('2026-01-01T10:00:00Z'),
            submittedAt: new Date('2026-01-01T10:20:00Z'),
          },
        ]),
      }),
    });

    mockUserModel.find.mockReturnValue(chainable([
      { _id: s1, name: 'Alice' },
      { _id: s2, name: 'Bob' },
      { _id: s3, name: 'Charlie' },
    ]));

    const result = await getClassStudentRankings(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result).toHaveLength(3);
    expect(result[0].rank).toBe(1);
    expect(result[0].percentage).toBe(90);
    // Bob and Charlie tie at 75%, both should have rank 2
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(2);
  });

  it('computes time used from startedAt to submittedAt', async () => {
    const s1 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [s1] }),
    });

    mockTestAttemptModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            studentId: s1,
            result: { percentage: 80, marksObtained: 8 },
            startedAt: new Date('2026-01-01T10:00:00Z'),
            submittedAt: new Date('2026-01-01T10:30:00Z'),
          },
        ]),
      }),
    });

    mockUserModel.find.mockReturnValue(chainable([{ _id: s1, name: 'Alice' }]));

    const result = await getClassStudentRankings(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result[0].timeUsed).toBe(1800); // 30 minutes = 1800 seconds
  });
});
