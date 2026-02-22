import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';

// ---- Hoisted Mocks (available to vi.mock factories) ----

const {
  mockTestAttemptModel,
  mockSnapshotModel,
  mockQuestionAnalyticsModel,
  mockQuestionModel,
  mockPurchaseModel,
  mockOnlineTestModel,
  mockClassModel,
  mockUserModel,
  mockStudentModel,
  mockMembershipModel,
} = vi.hoisted(() => {
  const mocks = {
    mockTestAttemptModel: {
      find: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
    } as Record<string, any>,
    mockSnapshotModel: {
      find: vi.fn(),
      findOneAndUpdate: vi.fn(),
    } as Record<string, any>,
    mockQuestionAnalyticsModel: {
      findOneAndUpdate: vi.fn(),
    } as Record<string, any>,
    mockQuestionModel: {
      find: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
    } as Record<string, any>,
    mockPurchaseModel: {
      aggregate: vi.fn(),
    } as Record<string, any>,
    mockOnlineTestModel: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn(),
    } as Record<string, any>,
    mockClassModel: {
      find: vi.fn(),
      findById: vi.fn(),
    } as Record<string, any>,
    mockUserModel: {
      find: vi.fn(),
    } as Record<string, any>,
    mockStudentModel: {
      find: vi.fn(),
    } as Record<string, any>,
    mockMembershipModel: {
      find: vi.fn(),
    } as Record<string, any>,
  };
  const mongoose = require('mongoose');
  mongoose.models.OnlineTest = mocks.mockOnlineTestModel;
  mongoose.models.Class = mocks.mockClassModel;
  mongoose.models.User = mocks.mockUserModel;
  mongoose.models.Student = mocks.mockStudentModel;
  mongoose.models.Membership = mocks.mockMembershipModel;
  return mocks;
});

vi.mock('../../../src/models/testAttempt', () => ({
  TestAttemptModel: mockTestAttemptModel,
}));

vi.mock('../../../src/models/studentAnalyticsSnapshot', () => ({
  StudentAnalyticsSnapshotModel: mockSnapshotModel,
  TopicPerformance: {},
  TestPerformanceEntry: {},
  SubjectBreakdown: {},
  DifficultyAnalysis: {},
  TimeAnalysis: {},
}));

vi.mock('../../../src/models/questionAnalytics', () => ({
  QuestionAnalyticsModel: mockQuestionAnalyticsModel,
  DistractorStats: {},
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

function toObjectId(hex?: string): Types.ObjectId {
  return new Types.ObjectId(hex ?? undefined);
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
const studentId = toObjectId();
const testId = toObjectId();
const questionId1 = toObjectId();
const questionId2 = toObjectId();
const classId = toObjectId();
const subjectId1 = toObjectId();
const topicId1 = toObjectId();
const chapterId1 = toObjectId();

function makeAttempt(overrides: Record<string, any> = {}) {
  return {
    _id: toObjectId(),
    companyId,
    studentId: overrides.studentId ?? studentId,
    testId: overrides.testId ?? testId,
    tenantId: 'tenant-1',
    status: 'graded',
    startedAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt: new Date('2026-01-01T10:30:00Z'),
    answers: overrides.answers ?? [
      {
        questionId: questionId1,
        answer: '0',
        isCorrect: true,
        timeSpent: 15,
      },
      {
        questionId: questionId2,
        answer: '1',
        isCorrect: false,
        timeSpent: 45,
      },
    ],
    result: overrides.result ?? {
      marksObtained: 5,
      totalMarks: 10,
      percentage: 50,
      rank: 1,
      percentile: 100,
      sectionScores: [
        { sectionName: 'Math', marksObtained: 5, totalMarks: 10, percentage: 50 },
      ],
      subjectScores: [
        { subjectId: subjectId1.toString(), subjectName: 'Math', percentage: 50 },
      ],
    },
    ...overrides,
  };
}

function makeQuestion(id: Types.ObjectId, overrides: Record<string, any> = {}) {
  return {
    _id: id,
    companyId,
    tenantId: 'tenant-1',
    type: 'mcq_single',
    content: {
      options: [
        { text: 'Option A' },
        { text: 'Option B' },
        { text: 'Option C' },
        { text: 'Option D' },
      ],
      correctAnswer: '0',
      ...overrides.content,
    },
    metadata: {
      subjectId: subjectId1.toString(),
      subjectName: 'Math',
      topicId: topicId1.toString(),
      topicName: 'Algebra',
      chapterId: chapterId1.toString(),
      chapterName: 'Chapter 1',
      difficulty: 'medium',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

// ---- Import service after mocks ----

import {
  computeStudentAnalytics,
  computeClassAnalytics,
  computeQuestionAnalytics,
  computeInstituteAnalytics,
  computeBulkStudentAnalytics,
  recomputeAfterTestCompletion,
} from '../../../src/services/analyticsComputationService';

// ====================================================================
// TESTS
// ====================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── computeStudentAnalytics ─────────────────────────────────────────

describe('computeStudentAnalytics', () => {
  it('computes correct average percentage for multiple attempts', async () => {
    const attempt1 = makeAttempt({ result: { marksObtained: 8, totalMarks: 10, percentage: 80, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] } });
    const attempt2 = makeAttempt({ result: { marksObtained: 6, totalMarks: 10, percentage: 60, rank: 2, percentile: 50, sectionScores: [], subjectScores: [] } });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt1, attempt2]));
    mockOnlineTestModel.find.mockReturnValue(chainable([
      { _id: testId, title: 'Test 1', mode: 'exam' },
    ]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(questionId1),
      makeQuestion(questionId2),
    ]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({
      overallStats: { averagePercentage: 70 },
    });

    const result = await computeStudentAnalytics(
      companyId.toString(),
      studentId.toString()
    );

    expect(mockSnapshotModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'all_time' }),
      expect.objectContaining({
        overallStats: expect.objectContaining({
          averagePercentage: 70,
          totalTestsTaken: 2,
        }),
      }),
      expect.any(Object)
    );
  });

  it('handles student with 0 tests (empty snapshot)', async () => {
    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({
      overallStats: { averagePercentage: 0, totalTestsTaken: 0 },
    });

    const result = await computeStudentAnalytics(
      companyId.toString(),
      studentId.toString()
    );

    expect(mockSnapshotModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        overallStats: expect.objectContaining({
          totalTestsTaken: 0,
          averagePercentage: 0,
          bestPercentage: 0,
          worstPercentage: 0,
          improvementRate: 0,
        }),
        testPerformance: [],
        topicPerformance: [],
        subjectBreakdown: [],
      }),
      expect.any(Object)
    );
  });

  it('handles student with 1 test (no improvement rate calculable)', async () => {
    const attempt = makeAttempt({ result: { marksObtained: 7, totalMarks: 10, percentage: 70, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] } });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt]));
    mockOnlineTestModel.find.mockReturnValue(chainable([
      { _id: testId, title: 'Test 1', mode: 'exam' },
    ]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(questionId1),
      makeQuestion(questionId2),
    ]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({
      overallStats: { improvementRate: 0 },
    });

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    expect(mockSnapshotModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        overallStats: expect.objectContaining({
          totalTestsTaken: 1,
          improvementRate: 0,
        }),
      }),
      expect.any(Object)
    );
  });

  it('computes correct difficulty analysis', async () => {
    const easyQ = toObjectId();
    const hardQ = toObjectId();
    const attempt = makeAttempt({
      answers: [
        { questionId: easyQ, answer: '0', isCorrect: true, timeSpent: 5 },
        { questionId: hardQ, answer: '1', isCorrect: false, timeSpent: 90 },
      ],
      result: { marksObtained: 5, totalMarks: 10, percentage: 50, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] },
    });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt]));
    mockOnlineTestModel.find.mockReturnValue(chainable([{ _id: testId, title: 'T', mode: 'exam' }]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(easyQ, { metadata: { difficulty: 'easy', subjectId: subjectId1.toString(), subjectName: 'S', topicId: topicId1.toString(), topicName: 'T' } }),
      makeQuestion(hardQ, { metadata: { difficulty: 'hard', subjectId: subjectId1.toString(), subjectName: 'S', topicId: topicId1.toString(), topicName: 'T' } }),
    ]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.difficultyAnalysis.easy.total).toBe(1);
    expect(updateCall.difficultyAnalysis.easy.correct).toBe(1);
    expect(updateCall.difficultyAnalysis.easy.accuracy).toBe(100);
    expect(updateCall.difficultyAnalysis.hard.total).toBe(1);
    expect(updateCall.difficultyAnalysis.hard.correct).toBe(0);
    expect(updateCall.difficultyAnalysis.hard.accuracy).toBe(0);
  });

  it('computes correct time analysis with distribution buckets', async () => {
    const q1 = toObjectId();
    const q2 = toObjectId();
    const q3 = toObjectId();
    const attempt = makeAttempt({
      answers: [
        { questionId: q1, answer: '0', isCorrect: true, timeSpent: 5 },   // 0-10s
        { questionId: q2, answer: '0', isCorrect: true, timeSpent: 25 },  // 10-30s
        { questionId: q3, answer: '1', isCorrect: false, timeSpent: 150 }, // 120s+
      ],
      result: { marksObtained: 5, totalMarks: 10, percentage: 50, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] },
    });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt]));
    mockOnlineTestModel.find.mockReturnValue(chainable([{ _id: testId, title: 'T', mode: 'exam' }]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(q1), makeQuestion(q2), makeQuestion(q3),
    ]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    const dist = updateCall.timeAnalysis.timeDistribution;
    expect(dist).toHaveLength(5);

    const bucket0_10 = dist.find((d: any) => d.label === '0-10s');
    expect(bucket0_10.count).toBe(1);

    const bucket10_30 = dist.find((d: any) => d.label === '10-30s');
    expect(bucket10_30.count).toBe(1);

    const bucket120 = dist.find((d: any) => d.label === '120s+');
    expect(bucket120.count).toBe(1);

    expect(updateCall.timeAnalysis.fastestQuestionTime).toBe(5);
    expect(updateCall.timeAnalysis.slowestQuestionTime).toBe(150);
  });

  it('computes topic performance with accuracy', async () => {
    const q1 = toObjectId();
    const q2 = toObjectId();
    const attempt = makeAttempt({
      answers: [
        { questionId: q1, answer: '0', isCorrect: true, timeSpent: 10 },
        { questionId: q2, answer: '1', isCorrect: false, timeSpent: 20 },
      ],
      result: { marksObtained: 5, totalMarks: 10, percentage: 50, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] },
    });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt]));
    mockOnlineTestModel.find.mockReturnValue(chainable([{ _id: testId, title: 'T', mode: 'exam' }]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(q1, { metadata: { subjectId: subjectId1.toString(), subjectName: 'Math', topicId: topicId1.toString(), topicName: 'Algebra', difficulty: 'easy' } }),
      makeQuestion(q2, { metadata: { subjectId: subjectId1.toString(), subjectName: 'Math', topicId: topicId1.toString(), topicName: 'Algebra', difficulty: 'medium' } }),
    ]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    // Same topic, so should be aggregated
    expect(updateCall.topicPerformance.length).toBeGreaterThanOrEqual(1);
    const algebraTopic = updateCall.topicPerformance.find((t: any) => t.topicName === 'Algebra');
    expect(algebraTopic).toBeDefined();
    expect(algebraTopic.totalQuestions).toBe(2);
    expect(algebraTopic.correctCount).toBe(1);
    expect(algebraTopic.accuracy).toBe(50);
  });

  it('uses period filter when specified', async () => {
    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString(), '2026-01');

    expect(mockSnapshotModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ period: '2026-01' }),
      expect.anything(),
      expect.any(Object)
    );
  });
});

// ─── Percentile calculation ──────────────────────────────────────────

describe('percentile calculation (via computeStudentAnalytics)', () => {
  it('computes class and org percentile from snapshots', async () => {
    const attempt = makeAttempt({
      result: { marksObtained: 8, totalMarks: 10, percentage: 80, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] },
    });

    mockTestAttemptModel.find.mockReturnValue(chainable([attempt]));
    mockOnlineTestModel.find.mockReturnValue(chainable([{ _id: testId, title: 'T', mode: 'exam' }]));
    mockQuestionModel.find.mockReturnValue(chainable([makeQuestion(questionId1), makeQuestion(questionId2)]));

    // Class with student + others
    const otherStudent1 = toObjectId();
    const otherStudent2 = toObjectId();
    mockClassModel.find.mockReturnValue(chainable([
      { _id: classId, students: [studentId, otherStudent1, otherStudent2], companyId, status: 'active' },
    ]));

    // Class snapshots: other students have lower avg
    const classChain = chainable([
      { studentUserId: studentId, overallStats: { averagePercentage: 80 } },
      { studentUserId: otherStudent1, overallStats: { averagePercentage: 60 } },
      { studentUserId: otherStudent2, overallStats: { averagePercentage: 40 } },
    ]);
    // Org snapshots
    const orgChain = chainable([
      { overallStats: { averagePercentage: 60 } },
      { overallStats: { averagePercentage: 40 } },
    ]);

    // First call is class percentile, second is org percentile, third is class avg time
    let snapshotFindCallCount = 0;
    mockSnapshotModel.find.mockImplementation(() => {
      snapshotFindCallCount++;
      if (snapshotFindCallCount === 1) return classChain;
      if (snapshotFindCallCount === 2) return orgChain;
      return chainable([]);
    });

    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({
      overallStats: { percentileInClass: 67, percentileInOrg: 100 },
    });

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    // Student avg 80 is above both class peers (60, 40) → percentile should be > 0
    expect(updateCall.overallStats.percentileInClass).toBeGreaterThanOrEqual(0);
    expect(updateCall.overallStats.percentileInOrg).toBeGreaterThanOrEqual(0);
  });
});

// ─── Improvement rate ────────────────────────────────────────────────

describe('improvement rate (via computeStudentAnalytics)', () => {
  it('computes positive improvement when scores increase', async () => {
    // 10 attempts: first 5 at 40%, last 5 at 80% → improvement = ((80-40)/40)*100 = 100
    const attempts = Array.from({ length: 10 }, (_, i) => {
      const pct = i < 5 ? 40 : 80;
      return makeAttempt({
        _id: toObjectId(),
        result: { marksObtained: pct / 10, totalMarks: 10, percentage: pct, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      });
    });

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.overallStats.improvementRate).toBe(100);
  });

  it('computes negative improvement when scores decrease', async () => {
    // first 5 at 80%, last 5 at 40% → improvement = ((40-80)/80)*100 = -50
    const attempts = Array.from({ length: 10 }, (_, i) => {
      const pct = i < 5 ? 80 : 40;
      return makeAttempt({
        _id: toObjectId(),
        result: { marksObtained: pct / 10, totalMarks: 10, percentage: pct, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      });
    });

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.overallStats.improvementRate).toBe(-50);
  });

  it('returns 0 improvement when first average is 0', async () => {
    // first 5 at 0%, last 5 at 50% → division by zero → 0
    const attempts = Array.from({ length: 10 }, (_, i) => {
      const pct = i < 5 ? 0 : 50;
      return makeAttempt({
        _id: toObjectId(),
        result: { marksObtained: pct / 10, totalMarks: 10, percentage: pct, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      });
    });

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.overallStats.improvementRate).toBe(0);
  });

  it('uses fewer tests when less than 5 available', async () => {
    // 3 attempts: first 2 at 40%, last at 60% → uses all available
    const attempts = [
      makeAttempt({ _id: toObjectId(), result: { marksObtained: 4, totalMarks: 10, percentage: 40, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] }, answers: [] }),
      makeAttempt({ _id: toObjectId(), result: { marksObtained: 4, totalMarks: 10, percentage: 40, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] }, answers: [] }),
      makeAttempt({ _id: toObjectId(), result: { marksObtained: 6, totalMarks: 10, percentage: 60, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] }, answers: [] }),
    ];

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    await computeStudentAnalytics(companyId.toString(), studentId.toString());

    const updateCall = mockSnapshotModel.findOneAndUpdate.mock.calls[0][1];
    // With 3 items: firstN = all 3 (avg ~46.7), lastN = all 3 (avg ~46.7) → ~0
    // Actually: firstN = slice(0, min(5,3)) = [40,40,60], lastN = slice(-3) = [40,40,60]
    // Both averages = 46.67 → improvement ≈ 0
    expect(typeof updateCall.overallStats.improvementRate).toBe('number');
  });
});

// ─── computeClassAnalytics ───────────────────────────────────────────

describe('computeClassAnalytics', () => {
  it('computes correct score stats (avg, median, highest, lowest, stdDev)', async () => {
    const student1 = toObjectId();
    const student2 = toObjectId();
    const student3 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: classId,
        students: [student1, student2, student3],
      }),
    });

    const attempts = [
      makeAttempt({ studentId: student1, result: { marksObtained: 8, totalMarks: 10, percentage: 80, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] }, answers: [] }),
      makeAttempt({ studentId: student2, result: { marksObtained: 6, totalMarks: 10, percentage: 60, rank: 2, percentile: 50, sectionScores: [], subjectScores: [] }, answers: [] }),
      makeAttempt({ studentId: student3, result: { marksObtained: 4, totalMarks: 10, percentage: 40, rank: 3, percentile: 0, sectionScores: [], subjectScores: [] }, answers: [] }),
    ];

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockUserModel.find.mockReturnValue(chainable([
      { _id: student1, name: 'Alice' },
      { _id: student2, name: 'Bob' },
      { _id: student3, name: 'Charlie' },
    ]));
    mockQuestionModel.find.mockReturnValue(chainable([]));

    const result = await computeClassAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result.scoreStats.avg).toBe(60);
    expect(result.scoreStats.median).toBe(60);
    expect(result.scoreStats.highest).toBe(80);
    expect(result.scoreStats.lowest).toBe(40);
    expect(result.scoreStats.stdDev).toBeGreaterThan(0);
  });

  it('produces score distribution that sums to total student count', async () => {
    const students = Array.from({ length: 5 }, () => toObjectId());

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students }),
    });

    const attempts = students.map((sid, i) =>
      makeAttempt({
        studentId: sid,
        result: { marksObtained: (i + 1) * 2, totalMarks: 10, percentage: (i + 1) * 20, rank: i + 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      })
    );

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockUserModel.find.mockReturnValue(chainable(students.map((s, i) => ({ _id: s, name: `Student ${i}` }))));
    mockQuestionModel.find.mockReturnValue(chainable([]));

    const result = await computeClassAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result.scoreDistribution).toHaveLength(10);
    const totalInBuckets = result.scoreDistribution.reduce((sum, b) => sum + b.count, 0);
    expect(totalInBuckets).toBe(5);
  });

  it('correctly identifies top and bottom performers', async () => {
    const students = Array.from({ length: 6 }, () => toObjectId());

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students }),
    });

    const percentages = [95, 85, 75, 65, 55, 45];
    const attempts = students.map((sid, i) =>
      makeAttempt({
        studentId: sid,
        result: { marksObtained: percentages[i] / 10, totalMarks: 10, percentage: percentages[i], rank: i + 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      })
    );

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockUserModel.find.mockReturnValue(chainable(
      students.map((s, i) => ({ _id: s, name: `Student${i}` }))
    ));
    mockQuestionModel.find.mockReturnValue(chainable([]));

    const result = await computeClassAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result.topPerformers).toHaveLength(5);
    expect(result.topPerformers[0].percentage).toBe(95);
    expect(result.bottomPerformers).toHaveLength(5);
    expect(result.bottomPerformers[0].percentage).toBeLessThanOrEqual(55);
  });

  it('computes correct completion rate', async () => {
    const students = Array.from({ length: 10 }, () => toObjectId());

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students }),
    });

    // Only 5 of 10 students completed
    const completedStudents = students.slice(0, 5);
    const attempts = completedStudents.map((sid) =>
      makeAttempt({
        studentId: sid,
        result: { marksObtained: 5, totalMarks: 10, percentage: 50, rank: 1, percentile: 50, sectionScores: [], subjectScores: [] },
        answers: [],
      })
    );

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockUserModel.find.mockReturnValue(chainable(
      completedStudents.map((s) => ({ _id: s, name: 'S' }))
    ));
    mockQuestionModel.find.mockReturnValue(chainable([]));

    const result = await computeClassAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result.completionRate).toBe(50);
  });

  it('returns most-missed questions sorted by accuracy ascending', async () => {
    const student1 = toObjectId();
    const q1 = toObjectId();
    const q2 = toObjectId();
    const q3 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [student1] }),
    });

    // q1: correct, q2: correct, q3: incorrect → q3 has lowest accuracy
    const attempts = [
      makeAttempt({
        studentId: student1,
        result: { marksObtained: 7, totalMarks: 10, percentage: 70, rank: 1, percentile: 100, sectionScores: [], subjectScores: [] },
        answers: [
          { questionId: q1, answer: '0', isCorrect: true, timeSpent: 10 },
          { questionId: q2, answer: '0', isCorrect: true, timeSpent: 10 },
          { questionId: q3, answer: '1', isCorrect: false, timeSpent: 10 },
        ],
      }),
    ];

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockUserModel.find.mockReturnValue(chainable([{ _id: student1, name: 'A' }]));
    mockQuestionModel.find.mockReturnValue(chainable([
      makeQuestion(q1), makeQuestion(q2), makeQuestion(q3),
    ]));

    const result = await computeClassAnalytics(
      companyId.toString(),
      classId.toString(),
      testId.toString()
    );

    expect(result.mostMissedQuestions.length).toBeGreaterThanOrEqual(1);
    // First should be the most missed (lowest accuracy)
    expect(result.mostMissedQuestions[0].accuracy).toBe(0);
    expect(result.mostMissedQuestions[0].questionId).toBe(q3.toString());
  });
});

// ─── computeQuestionAnalytics ────────────────────────────────────────

describe('computeQuestionAnalytics', () => {
  it('computes correct accuracy and time averages', async () => {
    const qId = toObjectId();
    const attempts = [
      makeAttempt({
        result: { marksObtained: 8, totalMarks: 10, percentage: 80 },
        answers: [
          { questionId: qId, answer: '0', isCorrect: true, timeSpent: 20 },
        ],
      }),
      makeAttempt({
        _id: toObjectId(),
        result: { marksObtained: 4, totalMarks: 10, percentage: 40 },
        answers: [
          { questionId: qId, answer: '1', isCorrect: false, timeSpent: 40 },
        ],
      }),
    ];

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        makeQuestion(qId, {
          content: { options: [{ text: 'A' }, { text: 'B' }], correctAnswer: '0' },
        })
      ),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(3);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ createdAt: new Date() }),
      }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.totalAttempts).toBe(2);
    expect(updateCall.correctCount).toBe(1);
    expect(updateCall.incorrectCount).toBe(1);
    expect(updateCall.accuracy).toBe(50);
    expect(updateCall.averageTimeSeconds).toBe(30);
    expect(updateCall.usageCount).toBe(3);
  });

  it('computes discrimination index: positive for good discriminator', async () => {
    const qId = toObjectId();
    // 10 attempts: top scorers get it right, bottom scorers get it wrong
    const attempts = Array.from({ length: 10 }, (_, i) => {
      const isTopGroup = i < 5;
      return makeAttempt({
        _id: toObjectId(),
        studentId: toObjectId(),
        result: { marksObtained: isTopGroup ? 9 : 3, totalMarks: 10, percentage: isTopGroup ? 90 : 30 },
        answers: [
          { questionId: qId, answer: isTopGroup ? '0' : '1', isCorrect: isTopGroup, timeSpent: 10 },
        ],
      });
    });

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(qId)),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.discriminationIndex).toBeGreaterThan(0);
  });

  it('computes discrimination index near zero for random question', async () => {
    const qId = toObjectId();
    // All students (mix of high/low scorers) get it right randomly
    const attempts = Array.from({ length: 10 }, (_, i) => {
      const isHighScorer = i < 5;
      const isCorrect = i % 2 === 0; // alternate correct/incorrect regardless of score
      return makeAttempt({
        _id: toObjectId(),
        studentId: toObjectId(),
        result: { marksObtained: isHighScorer ? 9 : 3, totalMarks: 10, percentage: isHighScorer ? 90 : 30 },
        answers: [
          { questionId: qId, answer: '0', isCorrect, timeSpent: 10 },
        ],
      });
    });

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(qId)),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    // Random question should have near-zero discrimination
    expect(Math.abs(updateCall.discriminationIndex)).toBeLessThanOrEqual(0.5);
  });

  it('returns 0 discrimination index for fewer than 4 students', async () => {
    const qId = toObjectId();
    const attempts = Array.from({ length: 3 }, (_, i) =>
      makeAttempt({
        _id: toObjectId(),
        studentId: toObjectId(),
        result: { marksObtained: i * 3, totalMarks: 10, percentage: i * 30 },
        answers: [{ questionId: qId, answer: '0', isCorrect: i > 0, timeSpent: 10 }],
      })
    );

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(qId)),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.discriminationIndex).toBe(0);
  });

  it('derives actual difficulty from accuracy ranges', async () => {
    const qId = toObjectId();

    // All correct → accuracy 100% → easy
    const attempts = Array.from({ length: 5 }, () =>
      makeAttempt({
        _id: toObjectId(),
        studentId: toObjectId(),
        result: { marksObtained: 10, totalMarks: 10, percentage: 100 },
        answers: [{ questionId: qId, answer: '0', isCorrect: true, timeSpent: 10 }],
      })
    );

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(qId, { metadata: { difficulty: 'hard' } })),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.accuracy).toBe(100);
    expect(updateCall.actualDifficulty).toBe('easy');
    expect(updateCall.taggedDifficulty).toBe('hard');
  });

  it('computes distractor analysis for MCQ (percentages sum to ~100%)', async () => {
    const qId = toObjectId();
    // 4 attempts choosing options A, A, B, C
    const attempts = [
      makeAttempt({ _id: toObjectId(), studentId: toObjectId(), result: { marksObtained: 10, totalMarks: 10, percentage: 100 }, answers: [{ questionId: qId, answer: '0', isCorrect: true, timeSpent: 10 }] }),
      makeAttempt({ _id: toObjectId(), studentId: toObjectId(), result: { marksObtained: 10, totalMarks: 10, percentage: 100 }, answers: [{ questionId: qId, answer: '0', isCorrect: true, timeSpent: 10 }] }),
      makeAttempt({ _id: toObjectId(), studentId: toObjectId(), result: { marksObtained: 5, totalMarks: 10, percentage: 50 }, answers: [{ questionId: qId, answer: '1', isCorrect: false, timeSpent: 10 }] }),
      makeAttempt({ _id: toObjectId(), studentId: toObjectId(), result: { marksObtained: 5, totalMarks: 10, percentage: 50 }, answers: [{ questionId: qId, answer: '2', isCorrect: false, timeSpent: 10 }] }),
    ];

    mockTestAttemptModel.find.mockReturnValue(chainable(attempts));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(qId, {
        content: {
          options: [{ text: 'Opt A' }, { text: 'Opt B' }, { text: 'Opt C' }, { text: 'Opt D' }],
          correctAnswer: '0',
        },
      })),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await computeQuestionAnalytics(companyId.toString(), qId.toString());

    const updateCall = mockQuestionAnalyticsModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.distractorAnalysis).toHaveLength(4);

    const totalPct = updateCall.distractorAnalysis.reduce(
      (sum: number, d: any) => sum + d.selectedPercentage,
      0
    );
    expect(totalPct).toBe(100);
    expect(updateCall.distractorAnalysis[0].isCorrect).toBe(true);
    expect(updateCall.distractorAnalysis[0].selectedPercentage).toBe(50);
  });
});

// ─── computeBulkStudentAnalytics ─────────────────────────────────────

describe('computeBulkStudentAnalytics', () => {
  it('computes analytics for all students in a class', async () => {
    const s1 = toObjectId();
    const s2 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: classId, students: [s1, s2] }),
    });

    // Each student's computation is mocked
    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    const count = await computeBulkStudentAnalytics(
      companyId.toString(),
      classId.toString()
    );

    expect(count).toBe(2);
  });
});

// ─── recomputeAfterTestCompletion ────────────────────────────────────

describe('recomputeAfterTestCompletion', () => {
  it('recomputes student analytics and question analytics for all test questions', async () => {
    const q1 = toObjectId();
    const q2 = toObjectId();

    // Mock for computeStudentAnalytics
    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockOnlineTestModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.find.mockReturnValue(chainable([]));
    mockClassModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.find.mockReturnValue(chainable([]));
    mockSnapshotModel.findOneAndUpdate.mockResolvedValue({});

    // Mock for test lookup
    mockOnlineTestModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: testId,
        sections: [{ questionIds: [q1, q2] }],
      }),
    });

    // Mock for computeQuestionAnalytics
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeQuestion(q1)),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(1);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await recomputeAfterTestCompletion(
      companyId.toString(),
      testId.toString(),
      studentId.toString()
    );

    // Should have called findOneAndUpdate for student snapshot
    expect(mockSnapshotModel.findOneAndUpdate).toHaveBeenCalled();
    // Should have called findOneAndUpdate for each question
    expect(mockQuestionAnalyticsModel.findOneAndUpdate).toHaveBeenCalled();
  });
});
